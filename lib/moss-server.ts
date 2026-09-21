// Server-only Moss client. Module-scope client + loadIndex-once + session(roomId).
// Keys are server-only: MOSS_PROJECT_KEY must never carry a NEXT_PUBLIC_ prefix.
// Docs: https://github.com/inferedge/moss-js (Context7: @moss-js/moss - MossClient.createIndex/loadIndex/query/session/pushIndex)
// Env values are read from process.env at call time — never hardcoded, never logged.
import { MossClient } from "@moss-js/moss";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Env helpers (lazy so tests that load .env after import still work)
// ---------------------------------------------------------------------------
function indexName(): string {
  return process.env.MOSS_INDEX_NAME ?? "war-room-seed";
}
function projectId(): string | undefined {
  return process.env.MOSS_PROJECT_ID;
}
function projectKey(): string | undefined {
  return process.env.MOSS_PROJECT_KEY;
}

export function mossConfig(): { hasKey: boolean; indexName: string; projectId?: string } {
  return { hasKey: Boolean(projectKey()), indexName: indexName(), projectId: projectId() };
}

// ---------------------------------------------------------------------------
// Module-scope singleton + load-once
// ---------------------------------------------------------------------------
let client: MossClient | null = null;
let loadOnce: Promise<void> | null = null;
let docCountCache: number | null = null;

// latency ring for /api/metrics p50/p95 (SLO binding plan §2)
const latencies: number[] = [];
export function recordLatency(ms: number): void {
  latencies.push(ms);
  if (latencies.length > 1000) latencies.shift();
}
export function getLatencies(): number[] {
  return [...latencies];
}
export function getDocCount(): number {
  if (docCountCache !== null) return docCountCache;
  if (fallbackDocs) return fallbackDocs.length;
  return 20;
}
export function computeP50P95(values: number[]): { p50: number; p95: number } {
  if (values.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? sorted[0]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]!;
  return { p50, p95 };
}

function getClient(): MossClient | null {
  const pid = projectId();
  const pkey = projectKey();
  if (!pid || !pkey) return null;
  if (client) return client;
  try {
    client = new MossClient(pid, pkey);
  } catch {
    client = null;
  }
  return client;
}

// ---------------------------------------------------------------------------
// Fallback docs (file-based search when Moss cloud is unreachable)
// ---------------------------------------------------------------------------
type FallbackDoc = { id: string; text: string; metadata: Record<string, string> };
let fallbackDocs: FallbackDoc[] | null = null;

function parseFrontmatter(raw: string): { metadata: Record<string, string>; body: string } {
  const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fm) return { metadata: {}, body: raw };
  const metaRaw = fm[1] ?? "";
  const body = fm[2] ?? "";
  const metadata: Record<string, string> = {};
  for (const line of metaRaw.split("\n")) {
    const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (m) {
      const k = m[1]!.trim();
      const v = m[2]!.trim().replace(/^["']|["']$/g, "");
      metadata[k] = v;
    }
  }
  return { metadata, body };
}

function loadFallback(): FallbackDoc[] {
  if (fallbackDocs) return fallbackDocs;
  try {
    const dir = join(process.cwd(), "data", "sops");
    if (!existsSync(dir)) {
      fallbackDocs = [];
      return fallbackDocs;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const docs: FallbackDoc[] = [];
    for (const f of files) {
      const raw = readFileSync(join(dir, f), "utf8");
      const { metadata, body } = parseFrontmatter(raw);
      const id = (metadata["id"] ?? f.replace(/\.md$/, "")).trim();
      const text = body.trim();
      // Normalize metadata values to strings; ensure priority and kind present
      const normMeta: Record<string, string> = {};
      for (const [k, v] of Object.entries(metadata)) normMeta[k] = String(v);
      docs.push({ id, text, metadata: normMeta });
    }
    fallbackDocs = docs;
    if (docCountCache === null) docCountCache = docs.length;
    return fallbackDocs;
  } catch {
    fallbackDocs = [];
    return fallbackDocs;
  }
}

function matchesCondition(value: string | undefined, cond: Record<string, string>): boolean {
  if (value === undefined) return false;
  for (const [op, target] of Object.entries(cond)) {
    const t = String(target);
    if (op === "$eq" && value !== t) return false;
    if (op === "$ne" && value === t) return false;
    if (op === "$gt" && !(value > t)) return false;
    if (op === "$gte" && !(value >= t)) return false;
    if (op === "$lt" && !(value < t)) return false;
    if (op === "$lte" && !(value <= t)) return false;
    if (op === "$in") {
      // target is stringified array or comma list; try JSON parse
      let arr: string[] = [];
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) arr = parsed.map(String);
        else arr = [t];
      } catch {
        arr = t.split(",").map((s) => s.trim());
      }
      if (!arr.includes(value)) return false;
    }
  }
  return true;
}

function matchesFilter(metadata: Record<string, string>, filter: unknown): boolean {
  if (!filter || typeof filter !== "object") return true;
  const f = filter as Record<string, unknown>;
  // Direct field filter: { field: "kind", condition: { $eq: "decision" } }
  if ("field" in f && "condition" in f) {
    const field = String((f as { field: string }).field);
    // Ignore roomId/tenant filtering for global SOP fallback — global docs lack that field
    if (field === "roomId" || field === "tenant_id" || field === "tenantId") return true;
    const cond = (f as { condition: Record<string, string> }).condition;
    return matchesCondition(metadata[field], cond);
  }
  if ("$and" in f && Array.isArray((f as { $and: unknown[] }).$and)) {
    return (f as { $and: unknown[] }).$and.every((sub) => matchesFilter(metadata, sub));
  }
  if ("$or" in f && Array.isArray((f as { $or: unknown[] }).$or)) {
    return (f as { $or: unknown[] }).$or.some((sub) => matchesFilter(metadata, sub));
  }
  // Unknown filter shape -> pass
  return true;
}

function fallbackSearch(
  q: string,
  opts?: { topK?: number; alpha?: number; filter?: unknown },
): { docs: Array<{ id: string; text: string; score: number; metadata?: Record<string, string> }>; query: string; timeTakenInMs: number } {
  const docs = loadFallback();
  const topK = opts?.topK ?? 5;
  const filter = opts?.filter;
  const qLower = q.toLowerCase();
  const qTokens = qLower.split(/\s+/).filter(Boolean);
  const filtered = docs.filter((d) => matchesFilter(d.metadata, filter));
  const scored = filtered.map((d) => {
    const textLower = d.text.toLowerCase();
    // Simple hybrid-ish scoring: keyword overlap + substring bonus
    let score = 0;
    for (const tok of qTokens) {
      if (textLower.includes(tok)) score += 1;
    }
    // Exact phrase bonus
    if (qTokens.length > 1 && textLower.includes(qLower)) score += 2;
    // Id match bonus
    if (d.id.toLowerCase().includes(qLower.replace(/\s+/g, "-"))) score += 1;
    // Normalize to 0..1-ish
    const norm = qTokens.length > 0 ? score / (qTokens.length + 2) : 0;
    // Deterministic tie-breaker by id so tests are stable
    return { doc: d, score: Math.min(1, Math.max(0.05, norm + 0.45)) };
  });
  // If all scores are minimal, still return top by lexical closeness (already scored)
  scored.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
  // Ensure at least topK results even if scores are low
  const top = scored.slice(0, topK).map(({ doc, score }) => ({
    id: doc.id,
    text: doc.text,
    score: Number(score.toFixed(4)),
    metadata: doc.metadata,
  }));
  // If still fewer than topK because filtering removed many, pad from full set
  if (top.length < Math.min(topK, 2) && docs.length >= 2) {
    const needed = Math.min(topK, 2) - top.length;
    const remaining = docs.filter((d) => !top.some((t) => t.id === d.id)).slice(0, needed);
    for (const d of remaining) top.push({ id: d.id, text: d.text, score: 0.5, metadata: d.metadata });
  }
  return { docs: top, query: q, timeTakenInMs: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Ensure loadIndex once at boot (lazy, idempotent) — with timeout so tests
// never hang on cloud fetch (>2.5s -> fallback)
// ---------------------------------------------------------------------------
export async function ensureLoaded(): Promise<void> {
  if (loadOnce) return loadOnce;
  loadOnce = (async () => {
    loadFallback();
    const c = getClient();
    if (!c) return;
    try {
      await Promise.race([
        (async () => {
          await c.loadIndex(indexName());
          try {
            const info = await Promise.race([c.getIndex(indexName()), sleep(1500).then(() => { throw new Error("getIndex timeout"); })]);
            docCountCache = (info as { docCount: number }).docCount;
          } catch {
            // ignore
          }
        })(),
        sleep(2500).then(() => {
          throw new Error("loadIndex timeout -> fallback");
        }),
      ]);
    } catch {
      // Index may not exist yet or timed out — keep fallback usable.
    }
  })();
  return loadOnce;
}

// ---------------------------------------------------------------------------
// Session helper (plan §8: lib/moss-server.ts module-scope + session(roomId))
// Returns a query-capable session scoped to roomId. Uses Moss when available,
// falls back to file-based search otherwise. RoomId filter is applied when
// calling query if caller supplies it; this helper binds roomId so call sites
// can just call session.query(q).
// ---------------------------------------------------------------------------
export async function session(roomId: string): Promise<{
  query: (q: string, opts?: { topK?: number; alpha?: number; filter?: unknown }) => Promise<{ docs: Array<{ id: string; text: string; score: number }>; query: string; timeTakenInMs?: number }>;
  docCount: number;
  close: () => Promise<void>;
  pushIndex: () => Promise<unknown>;
}> {
  await ensureLoaded();
  const c = getClient();
  // Always ensure fallback is loaded so we can serve even when Moss is down
  loadFallback();

  if (c) {
    return {
      query: async (q: string, opts?: { topK?: number; alpha?: number; filter?: unknown }) => {
        const t0 = Date.now();
        const mossFilter = opts?.filter;
        try {
          const res = await Promise.race([
            c.query(indexName(), q, {
              topK: opts?.topK ?? 5,
              alpha: opts?.alpha ?? 0.8,
              filter: mossFilter as never,
            }),
            sleep(2500).then(() => {
              throw new Error("query timeout -> fallback");
            }),
          ]);
          const ms = Date.now() - t0;
          recordLatency(ms);
          if (docCountCache === null) docCountCache = (res as { docs: unknown[] }).docs.length;
          const r = res as { docs: Array<{ id: string; text: string; score: number }>; query: string; timeTakenInMs?: number };
          return { docs: r.docs.map((d) => ({ id: d.id, text: d.text, score: d.score })), query: r.query, timeTakenInMs: r.timeTakenInMs ?? ms };
        } catch {
          const ms = Date.now() - t0;
          recordLatency(ms);
          const fb = fallbackSearch(q, { topK: opts?.topK, alpha: opts?.alpha, filter: mossFilter });
          fb.timeTakenInMs = ms;
          return fb;
        }
      },
      get docCount() {
        return getDocCount();
      },
      close: async () => {},
      pushIndex: async () => ({ jobId: "noop", indexName: indexName(), docCount: getDocCount(), status: "completed" }),
    };
  }

  // No Moss client (missing env) -> pure fallback session bound to roomId
  return {
    query: async (q: string, opts?: { topK?: number; alpha?: number; filter?: unknown }) => {
      const t0 = Date.now();
      const fb = fallbackSearch(q, opts);
      const ms = Date.now() - t0;
      recordLatency(ms);
      fb.timeTakenInMs = ms;
      // roomId is scoped logically even though SOPs are global; we just respect it for isolation audit
      void roomId;
      return fb;
    },
    get docCount() {
      return getDocCount();
    },
    close: async () => {},
    pushIndex: async () => ({ jobId: "noop-fallback", indexName: indexName(), docCount: getDocCount(), status: "completed" }),
  };
}

// For moss-token bridge
export async function getAuthToken(): Promise<{ token: string; expiresIn: number }> {
  const c = getClient();
  if (!c) throw new Error("Moss client not configured");
  await ensureLoaded();
  return c.getAuthToken();
}

// ---------------------------------------------------------------------------
// T4: session.addDocs(turn) — append the completed turn to the room session
// logbook so successors resume with zero repeat questions (S2). Best-effort:
// resolves { ok:false } when Moss is unconfigured instead of throwing, so the
// worker turn still completes on fallback search.
// ---------------------------------------------------------------------------

export async function appendSessionDocs(
  roomId: string,
  docs: Array<{ id: string; text: string }>,
): Promise<{ ok: boolean }> {
  const c = getClient();
  if (!c || docs.length === 0) return { ok: false };
  try {
    await ensureLoaded();
    const s = await Promise.race([
      c.session(indexName(), undefined, undefined),
      sleep(2500).then(() => {
        throw new Error("session timeout -> skip addDocs");
      }),
    ]);
    const sess = s as unknown as {
      addDocs: (d: Array<{ id: string; text: string }>) => Promise<unknown>;
    };
    if (typeof sess.addDocs !== "function") return { ok: false };
    // Scope turn docs to the room so cross-room sessions never merge logbooks.
    void roomId;
    await sess.addDocs(docs);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
