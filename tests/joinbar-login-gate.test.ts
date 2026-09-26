// JoinBar login gate (TDD RED): signed-out New room / Join must queue a
// pending room entry + open the login modal via baton:open-login, and the
// pending entry must POST /api/rooms/ensure before navigating (create +
// enter). Signed-in stays immediate. Source-mirror style like
// tests/hero-join.test.ts (no @testing-library in this repo).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync("components/SessionGate.tsx", "utf8");

describe("JoinBar login gate mirrors hero pending-then-run flow", () => {
  it("JoinBar dispatches baton:open-login when signed out (no direct ensure+push)", () => {
    expect(gate).toContain("OPEN_LOGIN_EVENT");
    // JoinBar itself must reference the gate event (not just SessionGate root).
    const bar = gate.slice(gate.indexOf("export function JoinBar"));
    expect(bar, "JoinBar must dispatch/open-login when signed out").toMatch(
      /OPEN_LOGIN_EVENT|open-login|onNeedLogin|needLogin|requireLogin/s,
    );
  });

  it("pending join-room carries a code and ensures before navigating", () => {
    expect(gate).toMatch(/join-room/);
    expect(gate).toContain("/api/rooms/ensure");
  });
});
