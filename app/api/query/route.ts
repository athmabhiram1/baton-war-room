import { NextResponse } from "next/server";

// TODO(W2): POST Moss session.query → citations + timeTakenInMs (S1 contract).
// Owned by T2 with tests/query.test.ts RED→GREEN. Stub: 501.
export async function POST() {
  return NextResponse.json({ error: "query not implemented" }, { status: 501 });
}
