"use client";

import { useEffect, useState } from "react";

// Co-sign UI tile: propose → sign (2nd distinct human) → execute against
// /api/approvals. High-risk actions need 2/2 on the same payloadHash inside
// the window; 1/2 execute stays blocked. PENDING polls status every 5s
// (APPROVAL_POLL_MS fallback) so webhook resume isn't the only path.
export default function CoSignTile({
  roomId,
  action = "rollback",
  payloadHash = "a94f06e9d31c2",
  me = "arun.m",
  peer = "priya.k",
}: {
  roomId: string;
  action?: string;
  payloadHash?: string;
  me?: string;
  peer?: string;
}) {
  const [id, setId] = useState<string | null>(null);
  const [sigs, setSigs] = useState("0/2");
  const [status, setStatus] = useState("idle");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(step: string, extra?: Record<string, string>) {
    setBusy(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, action, payloadHash, actor: me, step, approvalId: id, ...extra }),
      });
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        status?: string;
        signatures?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        setNote({ ok: false, text: body?.error ?? `${step} failed (${res.status})` });
        return;
      }
      if (body?.id) setId(body.id);
      if (body?.signatures) setSigs(body.signatures);
      if (body?.status) setStatus(body.status);
      setNote({ ok: true, text: `${step}: ${body?.signatures ?? body?.status ?? "ok"}` });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!id || status === "executed" || status === "expired") return;
    const iv = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId, step: "status", approvalId: id }),
          });
          if (!res.ok) return;
          const body = (await res.json()) as { status?: string; signatures?: string };
          if (body.signatures) setSigs(body.signatures);
          if (body.status) setStatus(body.status);
        } catch {
          // Poll is best-effort; webhook/ratify is the primary resume.
        }
      })();
    }, 5000);
    return () => clearInterval(iv);
  }, [id, status, roomId]);

  return (
    <div id="cosignTile" data-approval-id={id ?? ""} data-signatures={sigs}>
      <div id="apProg">
        <span>
          {sigs === "2/2" ? "2 of 2 signatures" : sigs === "1/2" ? "1 of 2 signatures" : "0 of 2 signatures"}
        </span>
        <span className="bar">
          <i style={{ width: sigs === "2/2" ? "100%" : sigs === "1/2" ? "50%" : "0%" }} />
        </span>
      </div>
      <div className="pane-actions">
        {!id ? (
          <button className="btn primary blk" disabled={busy} onClick={() => void call("propose")} type="button">
            {busy ? "Proposing…" : `Propose ${action} as ${me}`}
          </button>
        ) : (
          <>
            <button
              className="btn primary blk"
              disabled={busy || sigs === "2/2"}
              onClick={() => void call("ratify", { actor: peer, payloadHash } as Record<string, string>)}
              type="button"
            >
              {busy ? "Signing…" : `Sign as ${peer}`}
            </button>
            <button
              className="btn blk"
              disabled={busy || sigs !== "2/2"}
              onClick={() => void call("execute")}
              type="button"
              title={sigs !== "2/2" ? "Blocked until 2/2 quorum (fail-closed)" : "Execute with 2/2 quorum"}
            >
              Execute ({sigs})
            </button>
          </>
        )}
      </div>
      <div id="apDone" className={note ? `show ${note.ok ? "good" : "fail"}` : ""}>
        <span>{note?.text}</span>
      </div>
    </div>
  );
}
