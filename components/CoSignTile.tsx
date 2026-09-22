"use client";

import { useEffect, useRef, useState } from "react";

import { actionPayloadHashBrowser, canonicalActionPayload } from "../lib/action-payload";

export type CoSignLive = {
  id: string | null;
  signatures: string;
  status: string;
  windowEndsAt: number | null;
  payloadHash: string;
};

// Co-sign UI tile: propose → sign (2nd distinct human) → execute against
// /api/approvals. High-risk actions need 2/2 on the same payloadHash inside
// the window; 1/2 execute stays blocked. PENDING polls status every 5s
// (APPROVAL_POLL_MS fallback) so webhook resume isn't the only path.
// The payloadHash is derived live (SHA-256 of the canonical action payload)
// unless the caller passes one explicitly; signature/window state lifts via
// onApproval so the room chrome never shows static-posing-as-live numbers.
export default function CoSignTile({
  roomId,
  action = "rollback",
  target = "v41.8→v41.7",
  payloadHash,
  me = "arun.m",
  peer = "priya.k",
  onApproval,
}: {
  roomId: string;
  action?: string;
  target?: string;
  payloadHash?: string;
  me?: string;
  peer?: string;
  onApproval?: (info: CoSignLive) => void;
}) {
  const [hash, setHash] = useState(payloadHash ?? "");
  const [id, setId] = useState<string | null>(null);
  const [sigs, setSigs] = useState("0/2");
  const [status, setStatus] = useState("idle");
  const [windowEndsAt, setWindowEndsAt] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef<CoSignLive>({ id: null, signatures: "0/2", status: "idle", windowEndsAt: null, payloadHash: payloadHash ?? "" });
  liveRef.current = {
    id,
    signatures: sigs,
    status,
    windowEndsAt,
    payloadHash: hash,
  };

  function report() {
    onApproval?.({ ...liveRef.current });
  }

  useEffect(() => {
    if (payloadHash) {
      setHash(payloadHash);
      return;
    }
    let live = true;
    void actionPayloadHashBrowser(canonicalActionPayload(roomId, action, target)).then((h) => {
      if (!live) return;
      setHash(h);
      liveRef.current = { ...liveRef.current, payloadHash: h };
      onApproval?.({ ...liveRef.current });
    });
    return () => {
      live = false;
    };
  }, [roomId, action, target, payloadHash, onApproval]);

  async function call(step: string, extra?: Record<string, string>) {
    if (!hash || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, action, payloadHash: hash, actor: me, step, approvalId: id, ...extra }),
      });
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        status?: string;
        signatures?: string;
        windowEndsAt?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        setNote({ ok: false, text: body?.error ?? `${step} failed (${res.status})` });
        return;
      }
      if (body?.id) setId(body.id);
      if (body?.signatures) setSigs(body.signatures);
      if (body?.status) setStatus(body.status);
      if (typeof body?.windowEndsAt === "number") setWindowEndsAt(body.windowEndsAt);
      setNote({ ok: true, text: `${step}: ${body?.signatures ?? body?.status ?? "ok"}` });
      liveRef.current = {
        id: body?.id ?? id,
        signatures: body?.signatures ?? sigs,
        status: body?.status ?? status,
        windowEndsAt: typeof body?.windowEndsAt === "number" ? body.windowEndsAt : windowEndsAt,
        payloadHash: hash,
      };
      report();
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
          const body = (await res.json()) as { status?: string; signatures?: string; windowEndsAt?: number };
          if (body.signatures) setSigs(body.signatures);
          if (body.status) setStatus(body.status);
          if (typeof body.windowEndsAt === "number") setWindowEndsAt(body.windowEndsAt);
          liveRef.current = {
            ...liveRef.current,
            signatures: body.signatures ?? liveRef.current.signatures,
            status: body.status ?? liveRef.current.status,
            windowEndsAt:
              typeof body.windowEndsAt === "number" ? body.windowEndsAt : liveRef.current.windowEndsAt,
          };
          report();
        } catch {
          // Poll is best-effort; webhook/ratify is the primary resume.
        }
      })();
    }, 5000);
    return () => clearInterval(iv);
  }, [id, status, roomId, onApproval]);

  return (
    <div
      id="cosignTile"
      data-approval-id={id ?? ""}
      data-signatures={sigs}
      data-status={status}
      data-payload-hash={hash}
    >
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
          <button
            className="btn primary blk"
            disabled={busy || !hash}
            onClick={() => void call("propose")}
            type="button"
          >
            {!hash ? "Deriving payload hash…" : busy ? "Proposing…" : `Propose ${action} as ${me}`}
          </button>
        ) : (
          <>
            <button
              className="btn primary blk"
              disabled={busy || sigs === "2/2"}
              onClick={() => void call("ratify", { actor: peer, payloadHash: hash } as Record<string, string>)}
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
