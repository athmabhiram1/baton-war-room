import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Wave 1 Task 3 (presentation-polish): presence honesty. Kill Liveblocks auth
// → the fallback must stay neutral, never invent AR/PK/B1 identities; the
// sidebar "Opened" age must be live-relative from room open time (never a
// hardcoded literal that contradicts the live INC+ timer); repeat-zero copy
// must only claim a logbook-backed zero (or be omitted); the typing
// indicator keeps rendering only on real peer presence.
function src(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

function staticAvatarsBlock(s: string): string {
  const m = s.match(/function StaticAvatars\(\)[\s\S]*?\n\}/);
  return m ? m[0] : "";
}

describe("presence honesty fallback", () => {
  it("StaticAvatars fallback shows neutral identities, never fake AR/PK/B1", () => {
    const s = src("app/room/[id]/Room.tsx");
    const block = staticAvatarsBlock(s);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/>(AR|PK|B1)</);
    expect(block).toContain("presence unavailable");
    expect(block.includes("—") || block.includes("?")).toBe(true);
  });

  it("presence fallback keeps ErrorBoundary + ClientSideSuspense wiring", () => {
    const s = src("app/room/[id]/Room.tsx");
    expect(s).toContain("ClientSideSuspense");
    expect(s).toContain("LiveErrorBoundary");
    expect(s).toContain("SafePresence");
  });

  it("sidebar Opened age is live-relative from room open time, never hardcoded", () => {
    const s = src("app/room/[id]/Room.tsx");
    expect(s).not.toContain("26 min ago");
    // live-relative: derives from the room-open timestamp and re-renders on tick
    expect(s).toContain("openedAt");
    expect(s).toContain("nowMs");
    expect(s.includes("min ago")).toBe(true);
  });

  it("repeat-zero copy only claims a logbook-backed zero (or omits it)", () => {
    const s = src("app/room/[id]/Room.tsx");
    expect(s).not.toContain("0 repeat questions");
    expect(s).not.toContain("· 0 repeat");
    expect(s).not.toContain("· 0 repeats");
    expect(s).not.toContain("with zero repeat");
    expect(s).not.toMatch(/REPEAT Q[\s\S]{0,120}>0</);
  });

  it("typing indicator renders only on real peer presence (logic unchanged)", () => {
    const s = src("app/room/[id]/Room.tsx");
    expect(s).toContain("o.presence?.typing");
    expect(s).toContain("typing.length > 0");
  });
});
