// T4: POST /api/turn — run one RoomMate worker turn over war-feed.
// Additive route: W1/W2 contracts (/api/query, /api/catchup, ...) untouched.
// Body: { q, roomId? }. DISABLE_LLM=1 (or no key) → extractive fallback.
import { NextResponse } from "next/server";

import { appendSessionDocs, session } from "@/lib/moss-server";
import { generateAnswer } from "@/lib/llm";
import { createFeedMessage, getFeedMessages, updateFeedMessage, writeTaskToStorage } from "@/lib/feed";
import { runWorkerTurn, WORKER_FEED_ID, type WorkerStatus } from "@/lib/worker";
import { logAudit } from "@/lib/db";

const statusLog: WorkerStatus[] = [];

export async function POST(req: Request) {
  const t0 = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const q = (body as { q?: unknown })?.q;
  if (typeof q !== "string" || q.trim().length === 0) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }
  const roomId = String(
    (body as { roomId?: unknown })?.roomId ??
      req.headers.get("x-room-id") ??
      req.headers.get("x-war-room-id") ??
      "war-seed",
  );

  try {
    const s = await session(roomId);
    const result = await runWorkerTurn(
      {
        queryMoss: (question, opts) => s.query(question, { topK: opts.topK, alpha: 0.8, filter: opts.filter }),
        generate: (prompt) => generateAnswer(prompt),
        getFeedMessages: () => getFeedMessages(roomId, WORKER_FEED_ID),
        createFeedMessage: (msg) =>
          createFeedMessage(roomId, msg as Record<string, string | number | boolean | null>),
        updateFeedMessage: (msg) =>
          updateFeedMessage(
            roomId,
            String((msg as { messageId?: unknown }).messageId ?? "turn-msg"),
            msg as Record<string, string | number | boolean | null>,
          ),
        writeTask: (task) =>
          writeTaskToStorage(roomId, task as Record<string, string | number | boolean | null>),
        addDocs: (turn) =>
          appendSessionDocs(roomId, [
            { id: String((turn as { id?: unknown }).id ?? `turn-${Date.now()}`), text: String((turn as { text?: unknown }).text ?? "") },
          ]),
        logAudit: async (evt) => {
          try {
            await logAudit({ roomId: evt.roomId, event: evt.event, details: evt.details });
          } catch {
            // Audit durability is T5's reconciler concern; the block itself
            // is already enforced — never fail a denied turn on audit write.
          }
          return { ok: true };
        },
        onStatus: (st) => {
          statusLog.push(st);
          if (statusLog.length > 50) statusLog.shift();
        },
        onTokenBatch: () => {},
      },
      { roomId, question: q },
    );

    if (result.blocked) {
      return NextResponse.json(
        {
          blocked: true,
          blockReason: result.blockReason,
          isolationViolation: true,
          citations: [],
          timeTakenInMs: result.timeTakenInMs,
        },
        { status: 403 },
      );
    }
    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      timeTakenInMs: result.timeTakenInMs ?? Date.now() - t0,
      feedId: WORKER_FEED_ID,
      status: "complete",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
