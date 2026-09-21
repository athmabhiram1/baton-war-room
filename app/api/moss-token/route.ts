import { NextResponse } from "next/server";

// TODO(W2): GET getAuthToken (IAuthenticator bridge). Stub: 501 until Moss is provisioned.
export async function GET() {
  return NextResponse.json({ error: "moss-token not implemented" }, { status: 501 });
}
