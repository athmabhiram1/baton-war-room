import { NextResponse } from "next/server";

// Root middleware: room/[id] session check → redirect /. Cross-room DENY lives here.
// (Plan §8 lists app/middleware.ts; Next.js only executes the root-level file,
// so the real logic is here and app/middleware.ts re-exports it.)
export function middleware() {
  // TODO(T2): real session check. Pass-through stub for scaffold.
  return NextResponse.next();
}

export const config = {
  matcher: "/room/:path*",
};
