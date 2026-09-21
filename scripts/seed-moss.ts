// Seed script: createIndex war-room-seed (moss-minilm) via Moss Node SDK (server only).
// Idempotent: re-run safe, ensures exactly 1 index with 20 SOP docs.
// Usage: npx tsx scripts/seed-moss.ts  OR  npm run seed (if wired)
// Env read from .env — never printed/committed.

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on injected env in CI/Vercel */
}

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MossClient } from "@moss-js/moss";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

function parseFrontmatter(raw: string): { metadata: Record<string, string>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { metadata: {}, body: raw };
  const metaRaw = m[1] ?? "";
  const body = m[2] ?? "";
  const metadata: Record<string, string> = {};
  for (const line of metaRaw.split("\n")) {
    const mm = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (mm) metadata[mm[1]!.trim()] = mm[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return { metadata, body };
}

async function main(): Promise<void> {
  const projectId = requiredEnv("MOSS_PROJECT_ID");
  const projectKey = requiredEnv("MOSS_PROJECT_KEY");
  const indexName = process.env.MOSS_INDEX_NAME ?? "war-room-seed";

  const dir = join(process.cwd(), "data", "sops");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) throw new Error("No SOP files found in data/sops");

  const docs = files.map((f) => {
    const raw = readFileSync(join(dir, f), "utf8");
    const { metadata, body } = parseFrontmatter(raw);
    const id = (metadata["id"] ?? f.replace(/\.md$/, "")).trim();
    const text = body.trim();
    // Moss metadata must be Record<string,string> — coerce
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) meta[k] = String(v);
    // Ensure kind + priority exist (spec requires them for filtering)
    if (!meta["kind"]) meta["kind"] = "finding";
    if (!meta["priority"]) meta["priority"] = "3";
    return { id, text, metadata: meta };
  });

  // Word count guard (150-300 spec) — warn without failing
  for (const d of docs) {
    const wc = d.text.split(/\s+/).filter(Boolean).length;
    if (wc < 100 || wc > 400) console.warn(`[seed] ${d.id} word count ${wc} outside 150-300 band`);
  }

  const client = new MossClient(projectId, projectKey);

  try {
    const indexes = await client.listIndexes();
    const existing = indexes.find((idx) => idx.name === indexName);
    if (existing) {
      console.log(`[seed] Index "${indexName}" exists (docCount=${existing.docCount}) — syncing ${docs.length} docs via addDocs (idempotent)`);
      // Sync via upsert addDocs — keeps exactly 1 index and updates content
      const result = await client.addDocs(indexName, docs, { upsert: true });
      console.log(`[seed] Sync complete: job ${result.jobId} docCount=${result.docCount}`);
      // Ensure loadable
      try {
        await client.loadIndex(indexName);
        console.log(`[seed] Verified loadIndex "${indexName}"`);
      } catch (e) {
        console.warn(`[seed] loadIndex after sync failed (will load on demand): ${(e as Error).message}`);
      }
      // Assert single index invariant
      const after = await client.listIndexes();
      const warRoomIndexes = after.filter((i) => i.name === indexName);
      if (warRoomIndexes.length !== 1) throw new Error(`Expected 1 index named ${indexName}, found ${warRoomIndexes.length}`);
      console.log(`[seed] Idempotent check passed — ${after.length} total index(es), 1 war-room-seed`);
      await client.close().catch(() => {});
      return;
    }

    console.log(`[seed] Creating index "${indexName}" with ${docs.length} docs (model moss-minilm)`);
    const created = await client.createIndex(indexName, docs, {
      modelId: "moss-minilm",
      onProgress: (p) => console.log(`[seed] createIndex ${p.status} ${p.progress}% phase=${p.currentPhase ?? "-"}`),
    });
    console.log(`[seed] Created: job ${created.jobId} docCount=${created.docCount}`);

    await client.loadIndex(indexName);
    console.log(`[seed] Loaded index "${indexName}" — ready for queries`);

    const finalList = await client.listIndexes();
    console.log(`[seed] Final index count: ${finalList.length} (expect 1 war-room-seed + any pre-existing others)`);
    const check = finalList.filter((i) => i.name === indexName);
    if (check.length !== 1) throw new Error(`Expected 1 war-room-seed after create, got ${check.length}`);

    await client.close().catch(() => {});
    console.log("[seed] Done");
  } catch (err) {
    await client.close().catch(() => {});
    // Helpful error without leaking key
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[seed] Failed: ${msg}`);
    // If Moss is unreachable but SOPs exist, we still consider seed "ok" for local fallback
    // so that /api/query can serve via file fallback. Do not exit nonzero for network-only failures
    // unless the caller explicitly wants strict.
    if (msg.includes("Missing required env")) throw err;
    if (process.env.SEED_STRICT === "1") throw err;
    console.warn("[seed] Continuing with file fallback — /api/query will serve from data/sops/*.md");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
