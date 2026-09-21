import { NextResponse } from "next/server";

// TODO(W2): GET p50/p95 + docCount (S3 proof surface). Stub: 501.
export async function GET() {
  return NextResponse.json({ error: "metrics not implemented" }, { status: 501 });
}
