// T4 RoomMate agent worker loop: one atomic turn over the war-feed.
// getFeedMessages(roomId) → Moss validation query (session roomId, topK 3,
// roomId/kind/priority filter + freshness; stale/conflicted → block + log
// isolation_violation) → generateText via Vercel AI SDK (G1 caps, G2
// truncation; DISABLE_LLM=1 → extractive fallback, zero generation) →
// createFeedMessage answer + mutateStorage task write (only after validation
// passes) + session.addDocs(turn). Tokens stream via updateFeedMessage
// batches; agent-status flows thinking→searching→writing→complete.
// T5 owns handoff/co-sign/funnel/HITL — nothing gate-related lives here.
import { shapeCitations, truncate, type Citation } from "./answer";

export const WORKER_FEED_ID = "war-feed";

/** G1/G2 caps: ≤6k chars in, ≤1k chars out, thinking ≤2k chars. */
export const WORKER_MAX_PROMPT_CHARS = 6000;
export const WORKER_MAX_OUT_CHARS = 1000;
export const WORKER_MAX_THINKING_CHARS = 2000;

/** Token batch size for updateFeedMessage streaming writes. */
export const WORKER_TOKEN_BATCH_CHARS = 120;

/** Default freshness: citations older than this with no fresh evidence block. */
export const WORKER_DEFAULT_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

export type WorkerStatus = "thinking" | "searching" | "writing" | "complete" | "blocked";

export type ValidationDoc = {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, string>;
  updatedAt?: number;
};

export type MossValidationResult = {
  docs: ValidationDoc[];
  query: string;
  timeTakenInMs?: number;
};

export interface WorkerDeps {
  queryMoss: (q: string, opts: { topK: number; filter: unknown }) => Promise<MossValidationResult>;
  generate: (prompt: string) => Promise<string>;
  getFeedMessages: () => Promise<{ data: unknown[] }>;
  createFeedMessage: (msg: Record<string, unknown>) => Promise<unknown>;
  updateFeedMessage: (msg: Record<string, unknown>) => Promise<unknown>;
  writeTask: (task: Record<string, unknown>) => Promise<unknown>;
  addDocs: (turn: Record<string, unknown>) => Promise<unknown>;
  logAudit: (evt: { roomId: string; event: string; details?: unknown }) => Promise<unknown>;
  onStatus: (s: WorkerStatus) => void;
  onTokenBatch: (batch: string) => void;
}

export interface WorkerTurnInput {
  roomId: string;
  question: string;
  freshnessMs?: number;
  topK?: number;
}

export type WorkerTurnResult = {
  status: "complete" | "blocked";
  blocked: boolean;
  answer: string;
  citations: Citation[];
  timeTakenInMs: number;
  blockReason?: "stale" | "cross-room" | "conflicted" | "no-evidence";
  isolationViolation?: boolean;
};

export function validationFilter(roomId: string): unknown {
  return {
    $and: [
      { field: "roomId", condition: { $eq: roomId } },
      {
        $or: [
          { field: "kind", condition: { $in: ["todo", "decision", "finding", "runbook", "policy"] } },
        ],
      },
      { field: "priority", condition: { $gte: "3" } },
    ],
  };
}

/**
 * Single backoff retry when room-scoped validation finds nothing: the seed
 * SOP corpus is global (no roomId on docs), so retry kind+priority only.
 * Isolation is still enforced in code below — any returned doc carrying a
 * foreign roomId blocks the turn.
 */
export function validationFilterBackoff(): unknown {
  return {
    $and: [
      {
        $or: [
          { field: "kind", condition: { $in: ["todo", "decision", "finding", "runbook", "policy"] } },
        ],
      },
      { field: "priority", condition: { $gte: "3" } },
    ],
  };
}

function isCrossRoom(doc: ValidationDoc, roomId: string): boolean {
  const owner = doc.metadata?.["roomId"] ?? doc.metadata?.["tenant_id"] ?? doc.metadata?.["tenantId"];
  return typeof owner === "string" && owner.length > 0 && owner !== roomId;
}

function isConflicted(doc: ValidationDoc): boolean {
  return doc.metadata?.["status"] === "conflicted" || doc.metadata?.["conflict"] === "true";
}

function isFresh(doc: ValidationDoc, now: number, freshnessMs: number): boolean {
  if (typeof doc.updatedAt !== "number") return true;
  return now - doc.updatedAt <= freshnessMs;
}

/** Extractive summary: quote citations inline, no generation spend. */
export function extractiveFallback(question: string, citations: Citation[]): string {
  const quoted = citations
    .slice(0, 5)
    .map((c) => `[${c.id} score=${c.score}] ${truncate(c.text, 280)}`)
    .join("\n\n");
  return `Extractive answer for "${truncate(question, 280)}" (DISABLE_LLM=1, no generation):\n\n${quoted}`;
}

function buildPrompt(question: string, citations: Citation[], thinking: string): string {
  const context = citations
    .slice(0, 5)
    .map((c) => `[${c.id} score=${c.score}] ${truncate(c.text, 1200)}`)
    .join("\n\n");
  const think = truncate(thinking, WORKER_MAX_THINKING_CHARS);
  return truncate(
    `You are baton-1, the war-room agent. Answer using ONLY the cited sources below; cite every claim as [id].\n\nQuestion: ${question}\n\nSources:\n${context}\n\nReasoning notes (internal, do not quote): ${think}`,
    WORKER_MAX_PROMPT_CHARS,
  );
}

/** Split an answer into streaming batches for updateFeedMessage writes. */
export function toTokenBatches(answer: string, size: number = WORKER_TOKEN_BATCH_CHARS): string[] {
  const out: string[] = [];
  for (let i = 0; i < answer.length; i += size) out.push(answer.slice(i, i + size));
  if (out.length === 0) out.push("");
  return out;
}

function isLlmDisabled(): boolean {
  return process.env.DISABLE_LLM === "1";
}

export async function runWorkerTurn(deps: WorkerDeps, input: WorkerTurnInput): Promise<WorkerTurnResult> {
  const t0 = Date.now();
  const { roomId, question } = input;
  const freshnessMs = input.freshnessMs ?? WORKER_DEFAULT_FRESHNESS_MS;
  const topK = input.topK ?? 3;

  deps.onStatus("thinking");
  try {
    await deps.getFeedMessages();
  } catch {
    // Feed read is context only — a missing feed must not fail the turn.
  }

  deps.onStatus("searching");
  let validation = await deps.queryMoss(question, { topK, filter: validationFilter(roomId) });
  let docs = validation.docs.slice(0, topK);
  if (docs.length === 0) {
    validation = await deps.queryMoss(question, { topK, filter: validationFilterBackoff() });
    docs = validation.docs.slice(0, topK);
  }
  const now = Date.now();

  let blockReason: WorkerTurnResult["blockReason"];
  if (docs.length === 0) {
    blockReason = "no-evidence";
  } else if (docs.some((d) => isCrossRoom(d, roomId))) {
    blockReason = "cross-room";
  } else if (docs.some(isConflicted)) {
    blockReason = "conflicted";
  } else if (!docs.some((d) => isFresh(d, now, freshnessMs))) {
    blockReason = "stale";
  }

  if (blockReason) {
    await deps.logAudit({
      roomId,
      event: "isolation_violation",
      details: { reason: blockReason, question: truncate(question, 280) },
    });
    deps.onStatus("blocked");
    return {
      status: "blocked",
      blocked: true,
      answer: "",
      citations: [],
      timeTakenInMs: Date.now() - t0,
      blockReason,
      isolationViolation: true,
    };
  }

  const citations = shapeCitations(
    docs.map((d) => ({ id: d.id, score: d.score, text: d.text })),
  );

  deps.onStatus("writing");
  const thinking = `topK=${topK} docs=${citations.map((c) => c.id).join(",")}`;
  let answer: string;
  if (isLlmDisabled()) {
    answer = extractiveFallback(question, citations);
  } else {
    const generated = await deps.generate(buildPrompt(question, citations, thinking));
    answer = truncate(generated, WORKER_MAX_OUT_CHARS);
  }

  const message = await deps.createFeedMessage({
    roomId,
    kind: "agent-answer",
    question: truncate(question, 500),
    answer,
    citations,
    status: "writing",
  });
  const messageId =
    (message as { id?: unknown })?.id != null ? String((message as { id: unknown }).id) : "turn-msg";

  let streamed = "";
  for (const batch of toTokenBatches(answer)) {
    streamed += batch;
    deps.onTokenBatch(batch);
    try {
      await deps.updateFeedMessage({ messageId, roomId, answer: streamed, status: "writing" });
    } catch {
      // Streaming batches are progressive enhancement — the final write below
      // carries the full answer even if a batch fails.
    }
  }
  await deps.updateFeedMessage({ messageId, roomId, answer, citations, status: "complete" });

  await deps.writeTask({
    roomId,
    kind: "agent-turn",
    question: truncate(question, 500),
    answer,
    citationIds: citations.map((c) => c.id),
    messageId,
    ts: Date.now(),
  });

  await deps.addDocs({
    id: `turn-${Date.now()}`,
    text: `Q: ${truncate(question, 500)}\nA: ${truncate(answer, 1500)}`,
    roomId,
  });

  deps.onStatus("complete");
  return {
    status: "complete",
    blocked: false,
    answer,
    citations,
    timeTakenInMs: Date.now() - t0,
  };
}
