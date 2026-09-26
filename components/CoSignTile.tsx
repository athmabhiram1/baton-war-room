"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { actionPayloadHashBrowser, canonicalActionPayload } from "../lib/action-payload";

export type CoSignLive = {
  id: string | null;
  signatures: string;
  status: string;
  windowEndsAt: number | null;
  payloadHash: string;
};

type OpenApproval = {
  id: string;
  status: string;
  signatures: string;
  windowEndsAt: number;
  payloadHash: string;
  action: string;
};

// Co-sign UI tile: adopt the room's ONE shared open approval → ratify as the
// logged-in session user → execute at 2/2. Both tabs fetch the same open row
// on mount so two parallel 1/2s can never fork; propose only fires when none
// is open (server joins duplicates idempotently as a second net).
// T8 session binding: NO actor is ever sent — the server stamps the caller
// from the Neon Auth session (a mismatched body.actor is 403 actor_spoof).
// The sign button ratifies strictly as `me` (the session user); there is no
// sign-as-teammate path. When no approval is open the tile renders idle state
// only — never red "approval not found" text.
export default function CoSignTile({
  roomId,
  action = "rollback",
  target = "v41.8→v41.7",
  payloadHash,
  me = "arun.m",
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

  function adopt(open: OpenApproval) {
    setId(open.id);
    setSigs(open.signatures);
    setStatus(open.status);
    setWindowEndsAt(open.windowEndsAt);
    liveRef.current = {
      id: open.id,
      signatures: open.signatures,
      status: open.status,
      windowEndsAt: open.windowEndsAt,
      payloadHash: hash || open.payloadHash,
    };
    report();
  }

  const fetchOpen = useCallback(async (): Promise<OpenApproval | null> => {
    if (!hash) return null;
    try {
      const res = await fetch(
        `/api/approvals?roomId=${encodeURIComponent(roomId)}&payloadHash=${encodeURIComponent(hash)}`,
        { method: "GET" },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { open?: OpenApproval | null };
      return body.open ?? null;
    } catch {
      return null;
    }
  }, [roomId, hash]);

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

  // Mount: adopt the room's shared open approval so both tabs show the same
  // row (Pow SIGNED / PREEVAN WAITING) instead of forking per-tab 1/2s.
  useEffect(() => {
    if (!hash) return;
    let live = true;
    void (async () => {
      const open = await fetchOpen();
      if (!live || !open) return;
      adopt(open);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, fetchOpen]);

  async function call(step: string) {
    if (!hash || busy) return;
    setBusy(true);
    try {
      if (step === "propose") {
        const open = await fetchOpen();
        if (open) {
          adopt(open);
          setNote({ ok: true, text: `joined open approval: ${open.signatures}` });
          return;
        }
      }
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, action, payloadHash: hash, step, approvalId: id }),
      });
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        status?: string;
        signatures?: string;
        windowEndsAt?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        // Stale/missing id (e.g. swept or executed elsewhere): re-sync to the
        // shared open approval and stay silent instead of red "not found" text.
        if (res.status === 404) {
          const open = await fetchOpen();
          if (open) {
            adopt(open);
            setNote(null);
            return;
          }
          setId(null);
          setSigs("0/2");
          setStatus("idle");
          setWindowEndsAt(null);
          setNote(null);
          liveRef.current = { id: null, signatures: "0/2", status: "idle", windowEndsAt: null, payloadHash: hash };
          report();
          return;
        }
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

  // Shared-open poll every 5s: both tabs converge on the same row without
  // reload. No open row + idle state renders nothing (never red text).
  useEffect(() => {
    if (!hash || status === "executed" || status === "expired") return;
    const iv = setInterval(() => {
      void (async () => {
        const open = await fetchOpen();
        if (open) {
          setId(open.id);
          setSigs(open.signatures);
          setStatus(open.status);
          setWindowEndsAt(open.windowEndsAt);
          liveRef.current = {
            ...liveRef.current,
            id: open.id,
            signatures: open.signatures,
            status: open.status,
            windowEndsAt: open.windowEndsAt,
          };
          report();
          return;
        }
        if (!id) return;
        try {
          const res = await fetch("/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId, step: "status", approvalId: id }),
          });
          if (res.status === 404) {
            setId(null);
            setSigs("0/2");
            setStatus("idle");
            setWindowEndsAt(null);
            setNote(null);
            liveRef.current = { id: null, signatures: "0/2", status: "idle", windowEndsAt: null, payloadHash: hash };
            report();
            return;
          }
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
          // Poll is best-effort; ratify/execute is the primary resume.
        }
      })();
    }, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, id, status, roomId, fetchOpen]);

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
              onClick={() => void call("ratify")}
              type="button"
            >
              {busy ? "Signing…" : `Sign as ${me}`}
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
