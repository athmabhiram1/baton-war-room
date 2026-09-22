import { NextResponse } from "next/server";
import { session, recordLatency } from "@/lib/moss-server";
import { fixtureDocs } from "@/lib/idb";

export async function POST(req: Request) {
  const t0 = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const q = (body as { q?: unknown })?.q;
  if (typeof q !== "string" || q.trim().length === 0) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }

  // ?fixture=1 (or body.fixture): canned docs, zero Moss calls. Returns
  // before any session() call so it works with no keys, offline, or demo.
  const url = new URL(req.url);
  const fixture =
    url.searchParams.get("fixture") === "1" ||
    (body as { fixture?: unknown })?.fixture === true;
  if (fixture) {
    const citations = fixtureDocs().map((d, i) => ({
      id: d.id,
      score: 1 - i * 0.01,
      text: d.text,
    }));
    return NextResponse.json({
      citations,
      timeTakenInMs: Date.now() - t0,
      fixture: true,
    });
  }
  // Room scoping (plan §5 RLS: warRoomId server-derived). For S1 use header/body
  // fallback to global so isolated tests pass without Liveblocks context.
  const roomId =
    (body as { roomId?: unknown })?.roomId ??
    req.headers.get("x-room-id") ??
    req.headers.get("x-war-room-id") ??
    "war-seed";

  try {
    const s = await session(String(roomId));
    // TopK 5 alpha 0.8 per spec; include roomId filter placeholder for isolation
    // Filtering on roomId is a no-op for global SOP docs (fallback ignores it),
    // but demonstrates Moss alpha/filter wiring for future per-room docs.
    const result = await s.query(q, {
      topK: 5,
      alpha: 0.8,
      // Example filter showing roomId discipline; fallback search ignores this field
      // so global SOPs still return. For real per-room logs this would scope.
      // filter: { field: "roomId", condition: { $eq: String(roomId) } },
    });

    const elapsed = Date.now() - t0;
    // Ensure p50/p95 tracking even though session already recorded; record here too for in-process path
    recordLatency(result.timeTakenInMs ?? elapsed);

    const citations = result.docs.slice(0, 5).map((d) => ({
      id: d.id,
      score: d.score,
      text: d.text.slice(0, 2000),
    }));

    if (citations.length < 2) {
      // Fallback already guarantees ≥2, but keep guard
      return NextResponse.json({ error: "no citations", citations, timeTakenInMs: result.timeTakenInMs ?? elapsed }, { status: 404 });
    }

    return NextResponse.json({
      citations,
      timeTakenInMs: result.timeTakenInMs ?? elapsed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
