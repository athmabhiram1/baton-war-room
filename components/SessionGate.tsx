"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SESSION_ROLES } from "../lib/auth/roles";
import { useSessionUser, type SessionUser } from "../lib/use-session-user";

// T8 front wiring (Wave 4, docs/BACKEND_PLAN.md): login modal →
// POST /api/auth/login, join bar → POST /api/rooms/ensure + /room/<code>.
// Reuses global theme classes only (.btn/.btn.primary/.modal/.ms/.mrow/
// .lg-brand/.lfield/.selwrap/.greet/.lerr/.lfoot/#scrim) —
// zero <style>/token/motion edits. Slots mirror docs/reference/fix_front.html:
// #modal-login #login-name/#login-role/#login-go, #join-code/#join-go/#room-new,
// [data-users="roster"].

export function normJoinCode(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (/^war-[a-z0-9_-]{1,64}$/.test(t)) return t;
  if (/^[a-z0-9_-]{1,64}$/.test(t)) return `war-${t}`;
  return null;
}

export function roomPath(code: string): string {
  return `/room/${code.replace(/^war-/, "")}`;
}

function randomHex(n: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, n);
  }
  return Math.random().toString(16).slice(2, 2 + n);
}

export function LoginModal({
  user,
  onLogin,
}: {
  user: SessionUser | null;
  onLogin: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(SESSION_ROLES[0]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return null;

  async function login() {
    const n = name.trim();
    if (n.length < 2) {
      setErr("Give yourself a name (2+ characters) to continue.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Contract: only name/role — never a userId; identity comes from the
        // session cookie the server sets on 200.
        body: JSON.stringify({ name: n, role }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setErr(body?.error ?? `login failed (${res.status})`);
        return;
      }
      onLogin();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const greetName = name.trim() || "—";

  function cancel() {
    setName("");
    setErr(null);
  }

  return (
    <div id="scrim" className="show" role="presentation">
      <div
        className="modal show"
        id="modal-login"
        role="dialog"
        aria-modal="true"
        aria-label="Take a seat in the war-room"
      >
        <div className="lg-brand">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 17 17 7"
              stroke="var(--warn)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="5.5" cy="18.5" r="2" fill="var(--warn)" />
            <circle cx="18.5" cy="5.5" r="2" fill="var(--warn)" />
          </svg>
          <b>Baton</b>
        </div>
        <h3>Take a seat in the war-room</h3>
        <p className="ms">
          Pick a name and role. Open a second tab with a different name and
          you&apos;re two people in the same room.
        </p>
        <input
          id="login-name"
          className="lfield"
          type="text"
          placeholder="Your name…"
          autoComplete="off"
          spellCheck={false}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void login();
          }}
        />
        <div className="selwrap">
          <select
            id="login-role"
            className="lfield"
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {SESSION_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className="greet" id="login-greet">
          <span className="gd"></span>
          <span>
            Joining as <b id="lg-name">{greetName}</b> ·{" "}
            <span id="lg-role">{role}</span>
          </span>
        </div>
        <div
          className={err ? "lerr show" : "lerr"}
          id="login-err"
          role="alert"
        >
          {err ?? "Give yourself a name (2+ characters) to continue."}
        </div>
        <div className="mrow" style={{ marginTop: 14 }}>
          <button
            className="btn"
            id="login-cancel"
            type="button"
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            id="login-go"
            disabled={busy}
            onClick={() => void login()}
            type="button"
          >
            {busy ? "Joining…" : "Continue"}
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="lfoot">
          Demo identity is stored in <b>sessionStorage</b> for this tab only.
          In production this becomes your Liveblocks identity.
        </p>
      </div>
    </div>
  );
}

export function JoinBar({ userName }: { userName: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(raw: string) {
    const norm = normJoinCode(raw);
    if (!norm) {
      setErr("Enter a room code — get one from a teammate, or create a new room.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/rooms/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: norm }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setErr(body?.error ?? `join failed (${res.status})`);
        return;
      }
      const path = roomPath(norm);
      setDone(path);
      router.push(path);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="joinbar">
      <input
        id="join-code"
        placeholder="war-…"
        spellCheck={false}
        autoComplete="off"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setErr(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void join(code);
          }
        }}
      />
      <button className="btn" id="join-go" disabled={busy} onClick={() => void join(code)} type="button">
        Join
      </button>
      <button
        className="btn primary"
        id="room-new"
        disabled={busy}
        onClick={() => void join(`war-${randomHex(6)}`)}
        type="button"
      >
        New room
      </button>
      {err && (
        <span id="join-err" role="alert">
          {err}
        </span>
      )}
      {done && <a href={done}>Enter {done.replace("/room/", "war-")} →</a>}
      <span>
        Joining as <b>{userName ?? "—"}</b>
      </span>
    </div>
  );
}

export default function SessionGate() {
  const { user, refresh } = useSessionUser();
  const name = user?.name || user?.id || null;
  return (
    <>
      <JoinBar userName={name} />
      <div data-users="roster" aria-label="Session roster">
        {user ? `${name} · ${user.role ?? ""}` : "Not signed in"}
      </div>
      <LoginModal user={user} onLogin={() => void refresh()} />
    </>
  );
}
