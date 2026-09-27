import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

import Room from "./Room";

// Cookies-dependent: getSession() per the Neon Auth SDK docs requires dynamic rendering.
export const dynamic = 'force-dynamic';

type SessionResult = {
  data?: { user?: { id?: unknown; role?: unknown } } | null;
};

export default async function WarRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Fail closed: no id, no cookie, no session, or session-backend error → /.
  // The edge proxy.ts already checked cookie presence; this is the full
  // server-side session check (T3).
  if (!id) redirect("/");
  const h = await headers();
  if (!h.get("cookie")) redirect("/");
  let userId = "";
  let role = "Observer";
  try {
    const session = (await (auth.getSession as (args: unknown) => Promise<unknown>)({
      headers: h,
    })) as SessionResult;
    if (typeof session?.data?.user?.id !== "string" || !session.data.user.id) redirect("/");
    userId = session.data.user.id;
    if (typeof session.data.user.role === "string" && session.data.user.role) {
      role = session.data.user.role;
    }
  } catch {
    redirect("/");
  }
  // Direct-URL join ≡ JoinBar ensure+push: without a membership row,
  // liveblocks-auth 403s and this window degrades to StaticAvatars while
  // other browsers see a ghost room. Join-by-code still holds (code in URL).
  try {
    const { ensureMembership } = await import("@/lib/rooms");
    await ensureMembership(`war-${id}`, userId, role);
  } catch {
    redirect("/");
  }
  return <Room id={id} />;
}
