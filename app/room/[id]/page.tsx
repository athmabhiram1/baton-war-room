import { redirect } from "next/navigation";

import Room from "./Room";

export default async function WarRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Server-side auth/session check lives here (T2). DENY lives in middleware.
  if (!id) redirect("/");
  return <Room id={id} />;
}
