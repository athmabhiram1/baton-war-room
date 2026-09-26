import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// TDD RED: components/GoogleSignIn.tsx does not exist yet. Zero network —
// fetch/window are injected fakes; the contract under test is:
// POST same-origin /api/auth/sign-in/social {provider:"google",callbackURL}
// (the [...path] passthrough) → redirect to the returned authorize URL →
// session cookie lands in the same jar GET /api/me reads.
import {
  SOCIAL_SIGN_IN_PATH,
  buildSocialSignInInit,
  defaultCallbackUrl,
  fallbackAuthorizeUrl,
  humanOAuthError,
  resolveSocialRedirect,
  startGoogleOAuth,
} from "../components/GoogleSignIn";
import GoogleSignIn from "../components/GoogleSignIn";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Google OAuth start (Neon shared keys, same cookie jar)", () => {
  it("targets the same-origin [...path] passthrough (cookie jar preserved)", () => {
    const init = buildSocialSignInInit("http://localhost:3112/");
    expect(SOCIAL_SIGN_IN_PATH).toBe("/api/auth/sign-in/social");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      provider: "google",
      callbackURL: "http://localhost:3112/",
    });
    // Same-origin relative path — never the Auth base URL directly, so the
    // session cookie is set on our origin and GET /api/me sees it.
    expect(SOCIAL_SIGN_IN_PATH.startsWith("/api/auth/")).toBe(true);
  });

  it("defaults the callback URL to the app origin root", () => {
    expect(defaultCallbackUrl("http://localhost:3112")).toBe("http://localhost:3112/");
    expect(defaultCallbackUrl("https://baton-war-room.vercel.app/some/room")).toBe(
      "https://baton-war-room.vercel.app/",
    );
  });

  it("redirects to the authorize URL returned by the Auth service", async () => {
    const fetchMock = vi.fn(async () =>
      okJson({ url: "https://auth.test.local/authorize/google?x=1", redirect: true }),
    );
    const assign = vi.fn();
    const url = await startGoogleOAuth({
      fetchFn: fetchMock as unknown as typeof fetch,
      assign,
      callbackURL: "http://localhost:3112/",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/auth/sign-in/social");
    expect(JSON.parse(init.body as string).provider).toBe("google");
    expect(assign).toHaveBeenCalledWith("https://auth.test.local/authorize/google?x=1");
    expect(url).toBe("https://auth.test.local/authorize/google?x=1");
  });

  it("throws a human error when the Auth service refuses (no raw codes leak)", async () => {
    const fetchMock = vi.fn(async () => okJson({ error: "auth_unavailable" }));
    const assign = vi.fn();
    await expect(
      startGoogleOAuth({
        fetchFn: fetchMock as unknown as typeof fetch,
        assign,
        callbackURL: "http://localhost:3112/",
      }),
    ).rejects.toThrow("Google sign-in failed");
    expect(assign).not.toHaveBeenCalled();
  });

  it("throws a human error on network failure (never raw exception text)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      startGoogleOAuth({
        fetchFn: fetchMock as unknown as typeof fetch,
        assign: vi.fn(),
        callbackURL: "http://localhost:3112/",
      }),
    ).rejects.toThrow("Couldn't reach");
  });

  it("resolveSocialRedirect prefers data.url, else the passthrough fallback", () => {
    expect(resolveSocialRedirect({ url: "https://auth.test.local/a" }, "fb")).toBe(
      "https://auth.test.local/a",
    );
    expect(resolveSocialRedirect({}, "fb")).toBe("fb");
    expect(resolveSocialRedirect(null, "fb")).toBe("fb");
  });

  it("fallback authorize URL keeps provider + callback on the same-origin passthrough", () => {
    const fb = fallbackAuthorizeUrl("http://localhost:3112", "http://localhost:3112/");
    expect(fb.startsWith("/api/auth/sign-in/social?")).toBe(true);
    expect(fb).toContain("provider=google");
    expect(fb).toContain("callbackURL=" + encodeURIComponent("http://localhost:3112/"));
  });

  it("humanOAuthError never renders raw server codes", () => {
    for (const raw of ["auth_unavailable", "login_failed", undefined, "weird_code"]) {
      expect(humanOAuthError(raw)).toBe("Google sign-in failed — try again.");
    }
    expect(humanOAuthError("offline")).toBe(
      "Couldn't reach the server — check your connection and try again.",
    );
  });

  it("renders a themed .btn button (zero new CSS) with an accessible label", () => {
    const html = renderToStaticMarkup(createElement(GoogleSignIn));
    expect(html).toContain("btn");
    expect(html).toContain("Continue with Google");
    expect(html).toContain('id="login-google"');
    expect(html).toContain('type="button"');
  });
});
