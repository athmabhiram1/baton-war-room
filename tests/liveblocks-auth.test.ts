import { describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env — rely on injected env */
}

import { POST } from "../app/api/liveblocks-auth/route";

function req(body: unknown) {
  return new Request("http://localhost/api/liveblocks-auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/liveblocks-auth", () => {
  it("authorizes a war-<id> room (not 501 stub)", async () => {
    const res = await POST(req({ room: "war-redtest" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    expect(typeof body.token).toBe("string");
    expect(body.token!.length).toBeGreaterThan(10);
  });

  it("denies rooms outside the war- namespace with 403", async () => {
    const res = await POST(req({ room: "other-room" }));
    expect(res.status).toBe(403);
  });

  it("requires a room and returns 400 when missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
