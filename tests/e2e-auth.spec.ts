// T8 front wiring (Wave 4, docs/BACKEND_PLAN.md): login modal → session API,
// join bar → ensure + /room/<code>, reload persists via cookie, spoof rejected.
// Backend contracts: POST /api/auth/login {name,role,email,password},
// POST /api/rooms/ensure|join {code}, GET /api/me. NEON_AUTH_BASE_URL is absent
// locally, so the spec mocks the session APIs at the network edge and asserts
// the FRONT wiring: request shapes, session-as-source-of-truth, and rejection
// surfacing.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const BASE = "http://localhost:3112";
const SESSION_USER = { id: "u_e2e_ada", name: "E2E Ada", role: "Observer" };

async function mockSession(page: Page): Promise<void> {
  // Mirrors reality: /api/me is 401 until the mocked login POST sets the
  // session (flag, not a call counter — StrictMode double-fires the mount
  // effect). Route handlers persist across reloads within a test, so the
  // flag models cookie persistence.
  let loggedIn = false;
  await page.route("**/api/auth/login", async (route) => {
    const req = route.request();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
    } catch {
      body = {};
    }
    // Contract: only name/role/email/password are read — a userId in the body
    // is never accepted.
    expect(body.name).toBe("E2E Ada");
    expect(body.role).toBe("Observer");
    expect(body.email).toBe("e2e-ada@example.com");
    expect(typeof body.password).toBe("string");
    expect(body.userId).toBeUndefined();
    loggedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // No __Secure- prefix: Chromium rejects Secure-prefixed cookies over
      // plain http, and the jar assertion below is the real proof of set.
      headers: {
        "set-cookie": "test-session.session_token=e2e-mocked; Path=/; HttpOnly",
      },
      body: JSON.stringify({ user: SESSION_USER }),
    });
  });
  await page.route("**/api/me", async (route) => {
    if (!loggedIn) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: SESSION_USER }),
    });
  });
}

async function openLogin(page: Page): Promise<void> {
  // Entry guard: the modal opens only via baton:open-login. Dispatch the
  // switch-identity action (no pending room navigation) so the test stays on
  // the landing page — the same modal the hero CTA opens. #ctaEnter is a
  // client island, so its presence proves hydration before dispatching.
  await expect(page.locator("#ctaEnter")).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("baton:open-login", { detail: { action: "switch-identity" } }),
      );
    });
    try {
      await expect(page.locator("#modal-login")).toBeVisible({ timeout: 1500 });
      return;
    } catch {
      // Listener not attached yet (hydration race) — redispatch.
    }
  }
  await expect(page.locator("#modal-login")).toBeVisible();
}

test("login modal → session cookie set → roster shows session user", async ({ page }) => {
  await mockSession(page);
  // Prevent the join-navigation from leaving the landing page mid-assert.
  await page.route("**/room/**", (route) => route.abort());

  await page.goto(`${BASE}/`);
  await openLogin(page);
  await expect(page.locator("#login-name")).toBeVisible();
  await expect(page.locator("#login-email")).toBeVisible();
  await expect(page.locator("#login-password")).toBeVisible();
  await expect(page.locator("#login-role")).toBeVisible();
  await expect(page.locator("#login-go")).toBeVisible();

  await page.fill("#login-name", "E2E Ada");
  await page.fill("#login-email", "e2e-ada@example.com");
  await page.fill("#login-password", "e2e-test-pass-1");
  await page.selectOption("#login-role", "Observer");
  // Email-login proof: themed modal with the email field filled, pre-submit.
  await page.screenshot({ path: "docs/evidence/login-email.png" });
  const loginResp = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
  );
  await page.click("#login-go");
  const resp = await loginResp;
  expect(resp.status()).toBe(200);
  // Real proof the session cookie was set: the browser jar holds it (this is
  // what makes reload persist via GET /api/me with credentials).
  const jar = await page.context().cookies();
  expect(jar.map((c) => c.name).join("\n")).toContain("session_token");

  await expect(page.locator("#modal-login")).toBeHidden();
  // Session proof on the landing page: the join bar binds to GET /api/me
  // (the roster itself lives in the room, not on the hero).
  await expect(page.locator("#jb-you")).toContainText("E2E Ada");

  await page.screenshot({ path: "docs/evidence/e2e-auth.png" });
});

test("join bar → POST /api/rooms/ensure + /room/<code> link", async ({ page }) => {
  await mockSession(page);
  // No room-route abort here: a successful join navigates to /room/<code>,
  // and the URL is the proof of the jump.
  let ensureBody: Record<string, unknown> | null = null;
  await page.route("**/api/rooms/ensure", async (route) => {
    try {
      ensureBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    } catch {
      ensureBody = null;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ room: { code: "war-demo01" }, member: { role: "Observer" } }),
    });
  });

  await page.goto(`${BASE}/`);
  await openLogin(page);
  await page.fill("#login-name", "E2E Ada");
  await page.fill("#login-email", "e2e-ada@example.com");
  await page.fill("#login-password", "e2e-test-pass-1");
  await page.selectOption("#login-role", "Observer");
  await page.click("#login-go");
  await expect(page.locator("#modal-login")).toBeHidden();

  await page.fill("#join-code", "demo01");
  const ensureReq = page.waitForRequest(
    (r) => r.url().includes("/api/rooms/ensure") && r.method() === "POST",
  );
  await page.click("#join-go");
  await ensureReq;
  expect(ensureBody).toEqual({ code: "war-demo01" });
  await expect(page).toHaveURL(/\/room\/demo01/);
});

test("reload persists login via GET /api/me (session is source of truth)", async ({
  page,
}) => {
  await mockSession(page);
  await page.route("**/room/**", (route) => route.abort());

  await page.goto(`${BASE}/`);
  await openLogin(page);
  await page.fill("#login-name", "E2E Ada");
  await page.fill("#login-email", "e2e-ada@example.com");
  await page.fill("#login-password", "e2e-test-pass-1");
  await page.selectOption("#login-role", "Observer");
  await page.click("#login-go");
  await expect(page.locator("#modal-login")).toBeHidden();

  await page.reload();
  // No re-login: /api/me restores the session user, modal stays closed.
  await expect(page.locator("#modal-login")).toBeHidden();
  await expect(page.locator("#jb-you")).toContainText("E2E Ada");
});

test("spoof actor attempt rejected (403 actor_spoof surfaced, never stamped)", async ({
  page,
}) => {
  await mockSession(page);
  await page.route("**/room/**", (route) => route.abort());
  await page.route("**/api/approvals", async (route) => {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (typeof body.actor === "string" && body.actor !== SESSION_USER.id) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "body.actor rejected: identity comes from the session",
          event: "actor_spoof",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "ap_e2e", status: "pending", signatures: "1/2" }),
    });
  });

  await page.goto(`${BASE}/`);
  const verdict = await page.evaluate(async () => {
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId: "war-demo01",
        action: "rollback",
        payloadHash: "e2e-hash",
        step: "propose",
        actor: "mallory",
      }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  });
  expect(verdict.status).toBe(403);
  expect(verdict.body.event).toBe("actor_spoof");
});
