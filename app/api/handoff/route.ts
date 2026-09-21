import { NextResponse } from "next/server";

// TODO(T5): POST initiate/ACK, PENDING_HANDOFF, 409/200 gates.
// Owned by T5 with tests/handoff.test.ts (<2min via short overrides). Stub: 501.
export async function POST() {
  return NextResponse.json({ error: "handoff not implemented" }, { status: 501 });
}
