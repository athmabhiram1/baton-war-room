"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SESSION_ROLES } from "../lib/auth/roles";
import { useSessionUser, type SessionUser } from "../lib/use-session-user";
import GoogleSignIn from "./GoogleSignIn";

// T8 front wiring (Wave 4, docs/BACKEND_PLAN.md): login modal →
// POST /api/auth/login, join bar → POST /api/rooms/ensure + /room/<code>.
// Reuses global theme classes only (.btn/.btn.primary/.modal/.ms/.mrow/
// .lg-brand/.lfield/.selwrap/.greet/.lerr/.lfoot/.joinbar/.jb-l/.jb-or/
// .jb-you/.join-err/.shake/#scrim) — zero <style>/token/motion edits.
// JoinBar mirrors docs/reference/fix_front.html L645-652 exactly:
// .joinbar > .jb-l ROOM + #join-code + .btn#join-go + .jb-or +
// .btn.primary#room-new + .join-err#join-err (.show only on real error) +
// .jb-you#jb-you (Joining as b#jb-name live from session + button#jb-change,
// .show only when signed in — signed out is the template's exact hidden
// state, never a half-wired mix). Entry guard mirrors template
// gated()/pendingAction: hero CTAs dispatch baton:open-login; the modal
// opens only then.

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
  action: "new-room" | "join-room" | "switch-identity";
  code?: string;
};

// Human sentences for login failures — never render raw server codes
// (auth_unavailable, login_failed, …) or raw exception text in #login-err.
export function humanLoginError(raw: string | null | undefined): string {
  switch (raw) {
    case "name_required":
      return "Give yourself a name (2+ characters) to continue.";
    case "invalid_role":
      return "Pick a valid role to continue.";
    case "email_required":
      return "Enter your email address to continue.";
    case "invalid_email":
      return "That email doesn't look right — check it and try again.";
    case "password_required":
      return "Enter your password to continue.";
    case "password_too_short":
      return "Use a password with 8+ characters.";
    case "invalid_credentials":
      return "Wrong email or password — try again, or use a new email to create an account.";
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
  forceOpen,
  onLogin,
  onClose,
}: {
  user: SessionUser | null;
  open: boolean;
  forceOpen?: boolean;
  onLogin: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(SESSION_ROLES[0]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || (user && !forceOpen)) return null;

  async function login() {
    const n = name.trim();
    if (n.length < 2) {
      setErr("Give yourself a name (2+ characters) to continue.");
      return;
    }
    const e = email.trim();
    if (!e) {
      setErr(humanLoginError("email_required"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setErr(humanLoginError("invalid_email"));
      return;
    }
    if (!password) {
      setErr(humanLoginError("password_required"));
      return;
    }
    if (password.length < 8) {
      setErr(humanLoginError("password_too_short"));
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Contract: only name/role/email/password — never a userId; identity
        // comes from the session cookie the server sets on 200.
        body: JSON.stringify({ name: n, role, email: e, password }),
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
    setEmail("");
    setPassword("");
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
          Sign in with your email and password — a new email creates an
          account. Open a second tab with a different email and you&apos;re
          two people in the same room.
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
        <label className="ms" htmlFor="login-email" style={{ margin: "9px 0 0" }}>
          Email for sign-in
        </label>
        <input
          id="login-email"
          className="lfield"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void login();
          }}
        />
        <input
          id="login-password"
          className="lfield"
          type="password"
          placeholder="Password (8+ characters)…"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void login();
          }}
          style={{ marginTop: 9 }}
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
        <GoogleSignIn />
        <p className="lfoot">
          Your session lives in a cookie for this browser only. In production
          this becomes your Liveblocks identity.
        </p>
      </div>
    </div>
  );
}

export function JoinBar({
  userName,
  userRole,
  onChangeIdentity,
}: {
  userName: string | null;
  userRole: string | null;
  onChangeIdentity: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function join(raw: string) {
    const norm = normJoinCode(raw);
    if (!norm || !/^war-[a-z0-9_-]{1,64}$/.test(norm)) {
      setErr(true);
      inputRef.current?.classList.add("shake");
      window.setTimeout(
        () => inputRef.current?.classList.remove("shake"),
        400,
      );
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch("/api/rooms/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: norm }),
      });
      if (!res.ok) {
        setErr(true);
        return;
      }
      router.push(roomPath(norm));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  // Entry guard (mirrors hero gated()/pendingAction): signed-out clicks never
  // hit /api/rooms/ensure directly — they queue a pending join-room with the
  // code and open the login modal; SessionGate runs ensure+push after login.
  // Signed-in clicks go immediate (ensure+push, unchanged).
  function requestEntry(raw: string) {
    const norm = normJoinCode(raw);
    if (!norm || !/^war-[a-z0-9_-]{1,64}$/.test(norm)) {
      setErr(true);
      inputRef.current?.classList.add("shake");
      window.setTimeout(
        () => inputRef.current?.classList.remove("shake"),
        400,
      );
      return;
    }
    if (userName) {
      void join(norm);
      return;
    }
    window.dispatchEvent(
      new CustomEvent<OpenLoginDetail>(OPEN_LOGIN_EVENT, {
        detail: { action: "join-room", code: norm },
      }),
    );
  }

  return (
    <div className="joinbar">
      <span className="jb-l">ROOM</span>
      <input
        ref={inputRef}
        id="join-code"
        placeholder="war-…"
        spellCheck={false}
        autoComplete="off"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setErr(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void requestEntry(code);
          }
        }}
      />
      <button className="btn" id="join-go" disabled={busy} onClick={() => void requestEntry(code)} type="button">
        Join
      </button>
      <span className="jb-or">or</span>
      <button
        className="btn primary"
        id="room-new"
        disabled={busy}
        onClick={() => void requestEntry(`war-${randomHex(6)}`)}
        type="button"
      >
        New room
      </button>
      <span className={err ? "join-err show" : "join-err"} id="join-err">
        Enter a room code — get one from a teammate, or create a new room.
      </span>
      <span className={userName ? "jb-you show" : "jb-you"} id="jb-you">
        Joining as <b id="jb-name">{userName ? `${userName}${userRole ? ` · ${userRole}` : ""}` : "—"}</b>
        <button id="jb-change" type="button" onClick={onChangeIdentity}>
          change
        </button>
      </span>
    </div>
  );
}

export default function SessionGate() {
  const { user, refresh } = useSessionUser();
  const router = useRouter();
  const name = user?.name || user?.id || null;
  const [loginOpen, setLoginOpen] = useState(false);
  const [forceLogin, setForceLogin] = useState(false);
  const pendingRef = useRef<null | (() => void | Promise<void>)>(null);

  function goNewRoom() {
    router.push(roomPath(`war-${randomHex(6)}`));
  }

  async function ensureAndGo(code: string) {
    const res = await fetch("/api/rooms/ensure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return;
    router.push(roomPath(code));
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
      if (detail?.action === "switch-identity") {
        pendingRef.current = null;
        setForceLogin(true);
        setLoginOpen(true);
        return;
      }
      if (detail?.action === "join-room") {
        const target = normJoinCode(detail.code ?? "") ?? `war-${randomHex(6)}`;
        if (user) {
          void ensureAndGo(target);
          return;
        }
        pendingRef.current = () => ensureAndGo(target);
        setLoginOpen(true);
        return;
      }
      if (detail?.action !== "new-room") return;
      runPendingOrOpen();
    }
    window.addEventListener(OPEN_LOGIN_EVENT, onOpenLogin);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, onOpenLogin);
  });

  function closeLogin() {
    pendingRef.current = null;
    setForceLogin(false);
    setLoginOpen(false);
  }

  function handleLoggedIn() {
    void refresh();
    setForceLogin(false);
    setLoginOpen(false);
    const act = pendingRef.current;
    pendingRef.current = null;
    if (act) void act();
  }

  function switchIdentity() {
    window.dispatchEvent(
      new CustomEvent<OpenLoginDetail>(OPEN_LOGIN_EVENT, {
        detail: { action: "switch-identity" },
      }),
    );
  }

  return (
    <>
      <JoinBar userName={name} userRole={user?.role ?? null} onChangeIdentity={switchIdentity} />
      <LoginModal
        user={user}
        open={loginOpen}
        forceOpen={forceLogin}
        onLogin={handleLoggedIn}
        onClose={closeLogin}
      />
    </>
  );
}
