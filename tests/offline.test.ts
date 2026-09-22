import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ?offline: badge renders on lost connection + outbox replay drains in order (T6 GREEN).
describe("?offline badge + replay", () => {
  it("queueOffline buffers ops and replayOffline drains in FIFO order", async () => {
    const { queueOffline, replayOffline } = await import("../lib/idb");
    expect(replayOffline()).toEqual([]);
    queueOffline({ roomId: "war-a", kind: "ack", payload: { by: "arun" } });
    queueOffline({ roomId: "war-a", kind: "ratify", payload: { by: "priya" } });
    const replayed = replayOffline() as Array<{ kind: string }>;
    expect(replayed.map((o) => o.kind)).toEqual(["ack", "ratify"]);
    expect(replayOffline()).toEqual([]);
  });
});

// T3 war-room UI (plan.md §4 T3): source-contract tests. Node-env safe
// (no jsdom): assert real implementations exist in component sources.
// RED reason on stubs: conditional badge / Liveblocks wiring absent.
function src(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

describe("T3 war-room UI wiring", () => {
  it("OfflineBadge: offline toggle shows badge (navigator.onLine + lost-connection → OFFLINE)", () => {
    const s = src("components/OfflineBadge.tsx");
    expect(s).toContain("navigator.onLine");
    expect(s).toContain("OFFLINE");
    // listens for connectivity flips (online/offline events or lost-connection)
    expect(s.includes("addEventListener") && s.includes("offline")).toBe(true);
  });

  it("OfflineBadge: ?fixture=1 shows FIXTURE badge", () => {
    const s = src("components/OfflineBadge.tsx");
    expect(s).toContain("FIXTURE");
    expect(s).toContain("fixture");
  });

  it("Room: RoomProvider id=war-<id> + ClientSideSuspense + LiveblocksProvider authEndpoint /api/liveblocks-auth", () => {
    const s = src("app/room/[id]/Room.tsx");
    expect(s).toContain("RoomProvider");
    expect(s).toContain("war-");
    expect(s).toContain("ClientSideSuspense");
    expect(s).toContain("LiveblocksProvider");
    expect(s).toContain("/api/liveblocks-auth");
  });

  it("SearchBox: POST /api/query, renders citations + score + ms", () => {
    const s = src("components/SearchBox.tsx");
    expect(s).toContain("/api/query");
    expect(s).toContain("AnswerCard");
    expect(s).toContain("score");
    expect(s.toLowerCase()).toContain("ms");
  });

  it("PresenceAvatars: avatar stack + typing via useOthers/useSelf", () => {
    const s = src("components/PresenceAvatars.tsx");
    expect(s).toContain("useOthers");
    expect(s).toContain("useSelf");
    expect(s.toLowerCase()).toContain("typing");
  });

  it("LatencyHud: per-answer ms + /api/metrics p50/p95 + LIVE/FIXTURE/OFFLINE", () => {
    const s = src("components/LatencyHud.tsx");
    expect(s).toContain("/api/metrics");
    expect(s).toContain("p50");
    expect(s).toContain("p95");
    expect(s).toContain("LIVE");
    expect(s).toContain("FIXTURE");
    expect(s).toContain("OFFLINE");
  });

  it("AckModal: explicit ownership ACK → POST /api/handoff", () => {
    const s = src("components/AckModal.tsx");
    expect(s).toContain("/api/handoff");
    expect(s).toContain("ACK");
  });
});
