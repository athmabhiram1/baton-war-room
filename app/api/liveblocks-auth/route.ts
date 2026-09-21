import { NextResponse } from "next/server";

// TODO(T2): POST prepareSession → allow(`war-<uuid>`) → authorize.
// Stub: 501 until Liveblocks secret is provisioned (W1).
export async function POST() {
  return NextResponse.json({ error: "liveblocks-auth not implemented" }, { status: 501 });
}
