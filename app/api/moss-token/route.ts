import { NextResponse } from "next/server";
import { getAuthToken } from "@/lib/moss-server";

export async function GET() {
  try {
    const tok = await getAuthToken();
    return NextResponse.json(tok);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Do not leak project key; return sanitized error
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
