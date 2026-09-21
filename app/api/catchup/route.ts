import { NextResponse } from "next/server";
import { session } from "@/lib/moss-server";

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const roomId =
    (body as { roomId?: unknown })?.roomId ??
    req.headers.get("x-room-id") ??
    req.headers.get("x-war-room-id") ??
    "war-seed";
  const q = (body as { q?: unknown })?.q;
  const query = typeof q === "string" && q.trim().length > 0 ? q : "high priority decision incident handoff";

  try {
    const s = await session(String(roomId));
    // High-priority recall: priority>3 AND kind in decision|finding (plan §8, S2 resume)
    const filter = {
      $and: [
        { field: "priority", condition: { $gt: "3" } },
        {
          $or: [
            { field: "kind", condition: { $eq: "decision" } },
            { field: "kind", condition: { $eq: "finding" } },
          ],
        },
      ],
    };
    const result = await s.query(query, { topK: 5, alpha: 0.8, filter });
    const citations = result.docs.map((d) => ({ id: d.id, score: d.score, text: d.text.slice(0, 2000) }));
    return NextResponse.json({ citations, timeTakenInMs: result.timeTakenInMs ?? 0, filter: "priority>3 kind decision|finding" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
