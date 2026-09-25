import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// T3 edge gate: cookie PRESENCE only. No session-SDK import here — the full
// session check lives in app/room/[id]/page.tsx (Node runtime). Edge-safe:
// no Node APIs, no auth SDK, pure header inspection.
// Markers cover the Neon Auth variants seen in app/api/auth/logout/route.ts
// (__Secure-neon-auth.session_token / .session_data) and the non-prefixed
// better-auth fallback (better-auth.session_token).
const SESSION_MARKERS = ["session_token", "session_data"];

function hasSessionCookie(req: NextRequest): boolean {
  const names = req.cookies.getAll().map((c) => c.name);
  if (names.some((n) => SESSION_MARKERS.some((m) => n.includes(m)))) return true;
  const raw = req.headers.get("cookie") ?? "";
  return SESSION_MARKERS.some((m) => raw.includes(m));
}

export default function proxy(req: NextRequest): NextResponse {
  if (!hasSessionCookie(req)) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/room/:path*"],
};
