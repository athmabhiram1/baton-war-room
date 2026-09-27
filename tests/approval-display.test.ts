// Approval display-vs-state rules: rings, note styling, and sign-button
// visibility must all derive from live approval state. RED until
// lib/approval-display lands.
import { describe, expect, it } from "vitest";

import {
  executedFallbackNote,
  isExecuted,
  meRingOn,
  peerRingOn,
  signActionVisible,
  terminalNote,
  type ApprovalView,
} from "@/lib/approval-display";

const idle: ApprovalView = { id: null, signatures: "0/2", status: "idle" };
const oneOfTwo: ApprovalView = { id: "a1", signatures: "1/2", status: "pending" };
const twoOfTwo: ApprovalView = { id: "a1", signatures: "2/2", status: "ratified" };
const executed: ApprovalView = { id: "a1", signatures: "2/2", status: "executed" };
const expired: ApprovalView = { id: "a1", signatures: "1/2", status: "expired" };

describe("signer rings follow live state", () => {
  it("idle shows no filled rings", () => {
    expect(meRingOn(idle)).toBe(false);
    expect(peerRingOn(idle)).toBe(false);
  });

  it("a signed row is never hollow: me fills once an approval is open", () => {
    expect(meRingOn(oneOfTwo)).toBe(true);
  });

  it("peer fills at 2/2 and stays filled once executed", () => {
    expect(peerRingOn(oneOfTwo)).toBe(false);
    expect(peerRingOn(twoOfTwo)).toBe(true);
    expect(peerRingOn(executed)).toBe(true);
  });

  it("expired fills nothing new", () => {
    expect(meRingOn(expired)).toBe(false);
    expect(peerRingOn(expired)).toBe(false);
  });
});

describe("executed is a success state", () => {
  it("detects the executed status", () => {
    expect(isExecuted(executed)).toBe(true);
    expect(isExecuted(twoOfTwo)).toBe(false);
  });

  it("an 'approval is executed' conflict maps to success styling, never error", () => {
    const note = terminalNote("approval is executed, not pending", executed);
    expect(note.ok).toBe(true);
  });

  it("a real failure keeps error styling", () => {
    const note = terminalNote("payloadHash mismatch (fail-closed)", oneOfTwo);
    expect(note.ok).toBe(false);
  });

  it("tabs that did not click execute still render green executed text", () => {
    const note = executedFallbackNote(executed);
    expect(note).not.toBeNull();
    expect(note?.ok).toBe(true);
    expect(executedFallbackNote(oneOfTwo)).toBeNull();
  });
});

describe("sign action visibility", () => {
  it("sign is offered while open and gone once executed", () => {
    expect(signActionVisible(oneOfTwo)).toBe(true);
    expect(signActionVisible(twoOfTwo)).toBe(true);
    expect(signActionVisible(executed)).toBe(false);
  });

  it("sign is never offered with no open approval", () => {
    expect(signActionVisible(idle)).toBe(false);
  });
});
