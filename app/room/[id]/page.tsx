import { redirect } from "next/navigation";

import Room from "./Room";

// Cookies-dependent: getSession() per the Neon Auth SDK docs requires dynamic rendering.
export const dynamic = 'force-dynamic';

export default async function WarRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Server-side auth/session check lives here (T2). DENY lives in middleware.
  if (!id) redirect("/");
  return <Room id={id} />;
}
