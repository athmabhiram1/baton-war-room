// Google OAuth sign-in (Neon shared keys) — NEW file, owned by this track.
// SessionGate.tsx / app/page.tsx / HeroActions.tsx are NOT touched; the lead
// mounts this button with the 3-line snippet in the final report.
//
// ── Neon console setup (do this once; shared-keys OAuth is already on) ──
// 1. Trusted domains (Neon console → your project → Auth → Domains, i.e. the
//    Managed Better Auth trusted-domains allowlist). Add EVERY origin users
//    sign in from, otherwise the callback is rejected:
//      http://localhost:3112                       (local dev, this demo)
//      https://<your-app>.vercel.app                (production)
//      https://<your-app>-*-<team>.vercel.app       (preview deploys accept a
//                                                   wildcard pattern)
//    CLI equivalent:  neon neon-auth domain add https://<your-app>.vercel.app
//    API equivalent:  POST /projects/{id}/branches/{branch_id}/auth/domains
//    Docs: https://neon.com/docs/auth/guides/configure-domains
// 2. Google provider console — authorized redirect URI (per Auth branch, since
//    every Neon branch has its own Auth base URL):
//      {NEON_AUTH_BASE_URL}/callback/google
//    With shared keys Neon hosts the OAuth client; you only register the
//    redirect above. Find NEON_AUTH_BASE_URL in .env.local.
//    Docs: https://neon.com/docs/auth/guides/setup-oauth
// 3. callbackURL shape: this button sends callbackURL = "<origin>/" (the app
//    origin root, e.g. http://localhost:3112/). After Google → Auth-service
//    callback, the user lands back on that same-origin URL and the session
//    cookie is already set, so GET /api/me + proxy gates + liveblocks-auth
//    work unchanged.
//
// ── Same-cookie-jar guarantee (verified by code path, no contract changes) ──
// - Start is POST {provider:"google",callbackURL} to the SAME-ORIGIN
//   /api/auth/sign-in/social, proxied by app/api/auth/[...path]/route.ts
//   (auth.handler()) to the Auth service. The response {url} is the Google
//   authorize URL; the browser does a full-page redirect there (popups break
//   third-party-cookie session handoff — always top-level navigation).
// - The OAuth callback hits the Auth service, which sets the session cookie
//   via the same passthrough (same origin ⇒ same jar: the
//   __Secure-neon-auth.session_token / better-auth.session_token markers
//   proxy.ts already gates on).
// - GET /api/me reads the cookie via auth.getSession (app/api/me/route.ts),
//   and POST /api/liveblocks-auth mints the Liveblocks token from that same
//   session id — both untouched.
// Flow refs: https://neon.com/docs/auth/guides/setup-oauth
//            https://neon.com/docs/auth/reference/nextjs-server
"use client";

import { useState } from "react";

// Canonical better-auth social sign-in endpoint, served same-origin through
// the app/api/auth/[...path] passthrough (see lib/auth/server.ts).
export const SOCIAL_SIGN_IN_PATH = "/api/auth/sign-in/social";
export const GOOGLE_PROVIDER = "google";

export type OAuthFetch = typeof fetch;
export type OAuthAssign = (url: string) => void;

export interface StartOAuthOptions {
  fetchFn: OAuthFetch;
  assign: OAuthAssign;
  callbackURL: string;
}

// App-origin root — must be a trusted domain in the Neon console (see above).
export function defaultCallbackUrl(origin: string): string {
  try {
    return new URL("/", origin).toString();
  } catch {
    return "/";
  }
}

// POST body for the social sign-in start (better-auth contract:
// https://neon.com/docs/auth/reference/nextjs-server — signIn.social with
// provider + callbackURL).
export function buildSocialSignInInit(callbackURL: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: GOOGLE_PROVIDER, callbackURL }),
  };
}

// Best-effort same-origin fallback when the POST returns no authorize URL:
// the [...path] passthrough forwards method+query to the Auth service.
// _origin is accepted for call-site symmetry but intentionally unused — the
// fallback must stay same-origin (relative) to preserve the cookie jar.
export function fallbackAuthorizeUrl(_origin: string, callbackURL: string): string {
  const params = new URLSearchParams({ provider: GOOGLE_PROVIDER, callbackURL });
  return `${SOCIAL_SIGN_IN_PATH}?${params.toString()}`;
}

// Prefer the authorize URL the Auth service returns; else the fallback.
// Never throws — always yields a string the browser can navigate to.
export function resolveSocialRedirect(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null) {
    const url = (data as Record<string, unknown>).url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  return fallback;
}

// Human sentence for OAuth failures — never raw server codes or exception
// text (mirrors humanLoginError in SessionGate.tsx without importing it;
// that file is owned by another track).
export function humanOAuthError(raw: string | null | undefined): string {
  if (raw === "offline") {
    return "Couldn't reach the server — check your connection and try again.";
  }
  return "Google sign-in failed — try again.";
}

// Extracts a server error code from a response payload, or "" when absent.
function extractErrorCode(data: unknown): string {
  if (typeof data === "object" && data !== null) {
    const code = (data as Record<string, unknown>).error;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "";
}

// Starts the Neon Google OAuth flow. Zero side effects beyond the injected
// fetch/assign — fully testable with mocks, zero network in tests.
export async function startGoogleOAuth(opts: StartOAuthOptions): Promise<string> {
  const fallback = fallbackAuthorizeUrl("", opts.callbackURL);
  let res: Response;
  try {
    res = await opts.fetchFn(SOCIAL_SIGN_IN_PATH, buildSocialSignInInit(opts.callbackURL));
  } catch {
    throw new Error(humanOAuthError("offline"));
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(humanOAuthError(extractErrorCode(data)));
  }
  const refused = extractErrorCode(data);
  if (refused) {
    // 200 with an error payload (e.g. provider disabled) is still a refusal —
    // never redirect on it.
    throw new Error(humanOAuthError(refused));
  }
  const url = resolveSocialRedirect(data, fallback);
  opts.assign(url);
  return url;
}

export interface GoogleSignInProps {
  callbackURL?: string;
  label?: string;
  onError?: (message: string) => void;
}

// Themed Google button — reuses global .btn/.btn.blk/.ic/.lerr classes from
// app/globals.css only; zero <style>/token additions.
export default function GoogleSignIn({ callbackURL, label, onError }: GoogleSignInProps) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const cb =
        callbackURL ?? (typeof window !== "undefined" ? defaultCallbackUrl(window.location.origin) : "/");
      await startGoogleOAuth({
        fetchFn: fetch,
        assign: (url: string) => window.location.assign(url),
        callbackURL: cb,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : humanOAuthError("login_failed");
      setErr(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="btn blk"
        id="login-google"
        type="button"
        disabled={busy}
        onClick={() => void signIn()}
        aria-label={label ?? "Continue with Google"}
      >
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.7 3-4.3 3-7.5z" />
          <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.7A10 10 0 0 0 12 22z" />
          <path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3.1a10 10 0 0 0 0 9.2l3.3-2.7z" />
          <path d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4A10 10 0 0 0 3.1 7.4l3.3 2.7C7.2 7.8 9.4 6 12 6z" />
        </svg>
        {busy ? "Redirecting…" : (label ?? "Continue with Google")}
      </button>
      <div className={err ? "lerr show" : "lerr"} id="login-google-err" role="alert">
        {err ?? ""}
      </div>
    </div>
  );
}
