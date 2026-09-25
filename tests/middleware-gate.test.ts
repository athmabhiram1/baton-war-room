import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import proxy from "../proxy";

function roomReq(cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new Request("http://localhost:3112/room/war-demo", { headers }));
}

describe("T3 proxy cookie-presence gate", () => {
  it("redirects to / (307) when no auth cookie is present", () => {
    const res = proxy(roomReq());
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/");
  });

  it("redirects to / (307) when cookies exist but no session cookie", () => {
    const res = proxy(roomReq("theme=dark; fixture=1"));
    expect(res.status).toBe(307);
  });

  it("passes through (no redirect) when the Neon session cookie is present", () => {
    const res = proxy(
      roomReq("__Secure-neon-auth.session_token=s3cr3t; Path=/; HttpOnly"),
    );
    // NextResponse.next() surfaces as status 200 with x-middleware-next in unit tests.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through for the non-prefixed better-auth session cookie variant", () => {
    const res = proxy(roomReq("better-auth.session_token=s3cr3t; Path=/"));
    expect(res.status).toBe(200);
  });
});
