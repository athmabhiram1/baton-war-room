"use client";

import { useState } from "react";

// Explicit ownership ACK: no room closes with PENDING_HANDOFF and no ACK.
// POSTs to /api/handoff (gates land in T5; until then the route answers 501
// and the modal surfaces that honestly instead of pretending).
export default function AckModal({
  roomId,
  actor = "",
  onAck,
  label = "Take ownership (ACK)",
}: {
  roomId?: string;
  onAck?: (res: { checkpoint: string | null }) => void;
  label?: string;
  actor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function ack() {
    if (!confirm || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ack", roomId, actor }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        checkpoint?: string;
      } | null;
      if (!res.ok) {
        setError(body?.error ?? `handoff ACK failed (${res.status})`);
        return;
      }
      setOpen(false);
      onAck?.({ checkpoint: typeof body?.checkpoint === "string" ? body.checkpoint : null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} type="button" className="btn primary blk">
        {label}
      </button>
      {open && (
        <div id="scrim" className="show" onClick={() => setOpen(false)} role="presentation">
          <div
            className="modal show"
            role="dialog"
            aria-modal="true"
            aria-label="Ownership ACK"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              <svg className="ic" viewBox="0 0 24 24">
                <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
              </svg>
              Accept the baton
            </h3>
            <p className="ms">
              Take explicit ownership of this room before it can close. Until your <b>ACK</b> is
              recorded, close stays blocked with <b>409 PENDING_HANDOFF</b>.
            </p>
            <label style={{ display: "block", margin: "8px 0", fontSize: 13.5 }}>
              <input
                aria-label="I accept ownership"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                type="checkbox"
              />{" "}
              I accept ownership of this incident room
            </label>
            {error && (
              <p role="alert" style={{ color: "var(--bad)", fontSize: 12.5 }}>
                {error}
              </p>
            )}
            <div className="mrow2">
              <button className="btn" onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!confirm || sending}
                onClick={() => void ack()}
                type="button"
              >
                {sending ? "Sending ACK…" : "ACK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
