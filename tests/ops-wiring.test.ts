// Ops-panel wiring: canonical payload + real SHA-256 + countdown math.
// Hash half lives in lib/action-payload.ts; the countdown half is new — RED
// until formatCountdown/ringOffset land.
import { describe, expect, it } from "vitest";

import {
  actionPayloadHashBrowser,
  actionPayloadHashHex,
  canonicalActionPayload,
  formatCountdown,
  RING_CIRCUMFERENCE,
  ringOffset,
  shortHash,
} from "@/lib/action-payload";

describe("canonical payload hash", () => {
  it("is room-bound: same action+target in different rooms hash differently", async () => {
    const h1 = await actionPayloadHashHex(canonicalActionPayload("war-roomA", "rollback", "v41.8→v41.7"));
    const h2 = await actionPayloadHashHex(canonicalActionPayload("war-roomB", "rollback", "v41.8→v41.7"));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).not.toBe(h1);
  });

  it("browser subtle-crypto agrees with the server hex for the same bytes", async () => {
    const canonical = canonicalActionPayload("war-opsdemo", "rollback", "v41.8→v41.7");
    await expect(actionPayloadHashBrowser(canonical)).resolves.toBe(
      await actionPayloadHashHex(canonical),
    );
  });

  it("shortHash abbreviates without inventing characters", async () => {
    const hex = await actionPayloadHashHex(canonicalActionPayload("war-x", "rollback", "v41.8→v41.7"));
    const short = shortHash(hex);
    expect(hex.startsWith(short.slice(0, 8))).toBe(true);
    expect(hex.endsWith(short.slice(-5))).toBe(true);
  });
});

describe("countdown", () => {
  it("formats a 10-minute window as 10:00 and clamps past-expiry to 00:00", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(61_000)).toBe("01:01");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5_000)).toBe("00:00");
  });

  it("maps full window to offset 0 and empty window to the full ring", () => {
    expect(ringOffset(1)).toBeCloseTo(0, 6);
    expect(ringOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE, 6);
    expect(ringOffset(0.5)).toBeCloseTo(RING_CIRCUMFERENCE / 2, 6);
  });
});
