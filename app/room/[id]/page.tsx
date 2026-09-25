import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

import Room from "./Room";

// Cookies-dependent: getSession() per the Neon Auth SDK docs requires dynamic rendering.
export const dynamic = 'force-dynamic';

type SessionResult = { data?: { user?: { id?: unknown } } | null };

export default async function WarRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Fail closed: no id, no cookie, no session, or session-backend error → /.
  // The edge proxy.ts already checked cookie presence; this is the full
  // server-side session check (T3).
  if (!id) redirect("/");
  const h = await headers();
  if (!h.get("cookie")) redirect("/");
  try {
    const session = (await (auth.getSession as (args: unknown) => Promise<unknown>)({
      headers: h,
    })) as SessionResult;
    if (typeof session?.data?.user?.id !== "string" || !session.data.user.id) redirect("/");
  } catch {
    redirect("/");
  }
  return <Room id={id} />;
}
