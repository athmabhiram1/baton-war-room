"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SESSION_ROLES } from "../lib/auth/roles";
import { useSessionUser, type SessionUser } from "../lib/use-session-user";

// T8 front wiring (Wave 4, docs/BACKEND_PLAN.md): login modal →
// POST /api/auth/login, join bar → POST /api/rooms/ensure + /room/<code>.
// Reuses existing global classes only (.btn/.modal/.ms/.mrow2/#scrim) —
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

  return (
    <div id="scrim" className="show" role="presentation">
      <div
        className="modal show"
        id="modal-login"
        role="dialog"
        aria-modal="true"
        aria-label="Take a seat in the war-room"
      >
        <h3>Take a seat in the war-room</h3>
        <p className="ms">
          Pick a name and role. Open a second tab with a different name and
          you&apos;re two people in the same room.
        </p>
        <input
          id="login-name"
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
        </div>
        {err && (
          <p id="login-err" role="alert">
            {err}
          </p>
        )}
        <div className="mrow2">
          <button
            className="btn primary"
            id="login-go"
            disabled={busy}
            onClick={() => void login()}
            type="button"
          >
            {busy ? "Joining…" : "Continue"}
          </button>
        </div>
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
