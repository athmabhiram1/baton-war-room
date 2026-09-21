// T4 RoomMate agent worker loop — RED first (TDD law, plan.md §5).
// Loop per feed turn: getFeedMessages → Moss validation query (topK 3,
// roomId/kind/priority filter + freshness; stale/conflicted → block + log
// isolation_violation) → generateText (G1 caps; DISABLE_LLM=1 → extractive
// fallback, zero generation) → createFeedMessage + mutateStorage task write
// (only after validation passes) + session.addDocs(turn).
// G1 pacing: generation is MOCKED here — no live LLM calls in tests.

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  WORKER_FEED_ID,
  extractiveFallback,
  runWorkerTurn,
  type WorkerDeps,
  type WorkerTurnInput,
} from "../lib/worker";

const ROOM = "war-t4-test";
const Q = "What is the rollback plan right now?";

function baseInput(over: Partial<WorkerTurnInput> = {}): WorkerTurnInput {
  return { roomId: ROOM, question: Q, ...over };
}

function baseDeps(over: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    // Fresh, same-room validation docs by default.
    queryMoss: vi.fn(async () => ({
      docs: [
        {
          id: "rollback",
          text: "Rollback v41.8 to v41.7 after freeze check and co-sign.",
          score: 0.94,
          metadata: { roomId: ROOM, kind: "runbook", priority: "5" },
          updatedAt: Date.now(),
        },
        {
          id: "deploy-freeze",
          text: "Deploy freeze engaged: no ships until SEV1 clears.",
          score: 0.88,
          metadata: { roomId: ROOM, kind: "policy", priority: "4" },
          updatedAt: Date.now(),
        },
      ],
      query: Q,
      timeTakenInMs: 3,
    })),
    generate: vi.fn(async () => "Cited answer: rollback per SOP."),
    getFeedMessages: vi.fn(async () => ({ data: [] })),
    createFeedMessage: vi.fn(async (msg: unknown) => ({ id: "m1", ...(msg as object) })),
    updateFeedMessage: vi.fn(async (msg: unknown) => msg),
    writeTask: vi.fn(async () => ({ ok: true })),
    addDocs: vi.fn(async () => ({ ok: true })),
    logAudit: vi.fn(async () => ({ ok: true })),
    onStatus: vi.fn(),
    onTokenBatch: vi.fn(),
    ...over,
  };
}

describe("T4 worker loop (RED)", () => {
  beforeEach(() => {
    vi.stubEnv("DISABLE_LLM", "0");
  });

  it("uses the war-feed feed id", () => {
    expect(WORKER_FEED_ID).toBe("war-feed");
  });

  it("blocks a stale/cross-room probe: no generation, no writes, logs isolation_violation", async () => {
    const deps = baseDeps({
      queryMoss: vi.fn(async () => ({
        docs: [
          {
            id: "other-room-doc",
            text: "Foreign room runbook — must never leak.",
            score: 0.99,
            metadata: { roomId: "war-someone-else", kind: "runbook", priority: "5" },
            updatedAt: Date.now(),
          },
        ],
        query: Q,
        timeTakenInMs: 2,
      })),
    });
    const res = await runWorkerTurn(deps, baseInput());

    expect(res.status).toBe("blocked");
    expect(res.blocked).toBe(true);
    // No generation spend on a blocked turn.
    expect(deps.generate).not.toHaveBeenCalled();
    // No feed/storage/session writes after a failed validation.
    expect(deps.createFeedMessage).not.toHaveBeenCalled();
    expect(deps.writeTask).not.toHaveBeenCalled();
    expect(deps.addDocs).not.toHaveBeenCalled();
    // Isolation violation is audited.
    expect(deps.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: ROOM, event: "isolation_violation" }),
    );
    expect(deps.onStatus).toHaveBeenCalledWith("blocked");
  });

  it("blocks a stale turn: all citations older than freshness window", async () => {
    const deps = baseDeps({
      queryMoss: vi.fn(async () => ({
        docs: [
          {
            id: "rollback",
            text: "Ancient rollback note.",
            score: 0.9,
            metadata: { roomId: ROOM, kind: "runbook", priority: "5" },
            updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 60, // 60 days old
          },
        ],
        query: Q,
        timeTakenInMs: 2,
      })),
    });
    const res = await runWorkerTurn(deps, baseInput({ freshnessMs: 1000 * 60 * 60 * 24 * 7 }));

    expect(res.status).toBe("blocked");
    expect(res.blocked).toBe(true);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.createFeedMessage).not.toHaveBeenCalled();
    expect(deps.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "isolation_violation" }),
    );
  });

  it("DISABLE_LLM=1 returns an extractive summary with zero generation spend", async () => {
    vi.stubEnv("DISABLE_LLM", "1");
    const deps = baseDeps();
    const res = await runWorkerTurn(deps, baseInput());

    expect(res.status).toBe("complete");
    expect(deps.generate).not.toHaveBeenCalled();
    // Extractive: answer carries citation ids + quoted text, no generation.
    expect(res.answer).toContain("rollback");
    expect(res.citations.length).toBeGreaterThanOrEqual(2);
    expect(res.citations[0]).toMatchObject({ id: expect.any(String) });
    // Writes still happen — validation passed, only generation was skipped.
    expect(deps.createFeedMessage).toHaveBeenCalledTimes(1);
    expect(deps.writeTask).toHaveBeenCalledTimes(1);
    expect(deps.addDocs).toHaveBeenCalledTimes(1);
  });

  it("happy path: cited answer end-to-end with status progression + session.addDocs(turn)", async () => {
    const deps = baseDeps();
    const res = await runWorkerTurn(deps, baseInput());

    expect(res.status).toBe("complete");
    expect(res.citations.length).toBeGreaterThanOrEqual(2);
    expect(res.answer.length).toBeGreaterThan(0);
    expect(typeof res.timeTakenInMs).toBe("number");
    // Agent-status progression thinking→searching→writing→complete.
    const seen = (deps.onStatus as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(seen).toEqual(["thinking", "searching", "writing", "complete"]);
    // Feed answer + storage task write + session logbook append.
    expect(deps.createFeedMessage).toHaveBeenCalledTimes(1);
    expect(deps.writeTask).toHaveBeenCalledTimes(1);
    expect(deps.addDocs).toHaveBeenCalledTimes(1);
    // Tokens stream to the feed in updateFeedMessage batches.
    expect(deps.updateFeedMessage).toHaveBeenCalled();
    expect(deps.onTokenBatch).toHaveBeenCalled();
  });

  it("extractiveFallback quotes citations without calling the LLM", () => {
    const out = extractiveFallback(Q, [
      { id: "rollback", score: 0.94, text: "Rollback v41.8 to v41.7." },
      { id: "deploy-freeze", score: 0.88, text: "Freeze is engaged." },
    ]);
    expect(out).toContain("[rollback score=0.94]");
    expect(out).toContain("[deploy-freeze score=0.88]");
    expect(out).toContain("Rollback v41.8 to v41.7.");
  });
});
