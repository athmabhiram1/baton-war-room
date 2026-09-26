"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SESSION_ROLES } from "../lib/auth/roles";
import { useSessionUser, type SessionUser } from "../lib/use-session-user";

// T8 front wiring (Wave 4, docs/BACKEND_PLAN.md): login modal →
// POST /api/auth/login, join bar → POST /api/rooms/ensure + /room/<code>.
// Reuses global theme classes only (.btn/.btn.primary/.modal/.ms/.mrow/
// .lg-brand/.lfield/.selwrap/.greet/.lerr/.lfoot/#scrim) —
// zero <style>/token/motion edits. Slots mirror docs/reference/fix_front.html:
// #modal-login #login-name/#login-role/#login-go/#login-cancel/#login-x,
// #login-greet > #lg-name/#lg-role, #login-err, #join-code/#join-go/#room-new,
// [data-users="roster"]. Entry guard mirrors template gated()/pendingAction:
// hero CTAs dispatch baton:open-login; the modal opens only then.

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

// Entry-guard event (mirrors template gated()/pendingAction in
// docs/reference/fix_front.html): hero CTAs dispatch this; SessionGate opens
// the login modal, then runs the pending action after a successful login.
export const OPEN_LOGIN_EVENT = "baton:open-login";

export type OpenLoginDetail = {
  action: "new-room";
};

// Human sentences for login failures — never render raw server codes
// (auth_unavailable, login_failed, …) or raw exception text in #login-err.
export function humanLoginError(raw: string | null | undefined): string {
  switch (raw) {
    case "name_required":
      return "Give yourself a name (2+ characters) to continue.";
    case "invalid_role":
      return "Pick a valid role to continue.";
    case "auth_unavailable":
      return "Sign-in is unavailable right now — try again in a bit.";
    case "login_failed":
      return "Couldn't sign you in — try again.";
    default:
      return "Couldn't sign you in — try again.";
  }
}

export function LoginModal({
  user,
  open,
  onLogin,
  onClose,
}: {
  user: SessionUser | null;
  open: boolean;
  onLogin: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(SESSION_ROLES[0]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || user) return null;

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
        setErr(humanLoginError(body?.error));
        return;
      }
      onLogin();
    } catch {
      setErr("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const greetName = name.trim() || "—";

  function cancel() {
    setName("");
    setErr(null);
    onClose();
  }

  return (
    <div id="scrim" className="show" role="presentation">
      <div
        className="modal show"
        id="modal-login"
        role="dialog"
        aria-modal="true"
        aria-label="Take a seat in the war-room"
        style={{ position: "relative" }}
      >
        <button
          className="icobtn"
          id="login-x"
          type="button"
          aria-label="Close login dialog"
          onClick={onClose}
          style={{ position: "absolute", top: 10, right: 10 }}
        >
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>
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
          autoFocus
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
          {err ?? ""}
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
  const router = useRouter();
  const name = user?.name || user?.id || null;
  const [loginOpen, setLoginOpen] = useState(false);
  const pendingRef = useRef<null | (() => void)>(null);

  function goNewRoom() {
    router.push(roomPath(`war-${randomHex(6)}`));
  }

  function runPendingOrOpen() {
    if (user) {
      goNewRoom();
      return;
    }
    pendingRef.current = goNewRoom;
    setLoginOpen(true);
  }

  useEffect(() => {
    function onOpenLogin(e: Event) {
      const detail = (e as CustomEvent<OpenLoginDetail>).detail;
      if (detail?.action !== "new-room") return;
      runPendingOrOpen();
    }
    window.addEventListener(OPEN_LOGIN_EVENT, onOpenLogin);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, onOpenLogin);
  });

  function closeLogin() {
    pendingRef.current = null;
    setLoginOpen(false);
  }

  function handleLoggedIn() {
    void refresh();
    setLoginOpen(false);
    const act = pendingRef.current;
    pendingRef.current = null;
    if (act) act();
  }

  return (
    <>
      <JoinBar userName={name} />
      <div data-users="roster" aria-label="Session roster">
        {user ? `${name} · ${user.role ?? ""}` : "Not signed in"}
      </div>
      <LoginModal
        user={user}
        open={loginOpen}
        onLogin={handleLoggedIn}
        onClose={closeLogin}
      />
    </>
  );
}
