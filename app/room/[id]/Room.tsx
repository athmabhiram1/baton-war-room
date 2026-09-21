"use client";

import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useOthers,
} from "@liveblocks/react/suspense";

import AckModal from "../../../components/AckModal";
import CoSignTile from "../../../components/CoSignTile";
import LatencyHud from "../../../components/LatencyHud";
import OfflineBadge from "../../../components/OfflineBadge";
import PresenceAvatars from "../../../components/PresenceAvatars";
import SearchBox from "../../../components/SearchBox";
import ThemeToggle from "../../../components/ThemeToggle";

type Toast = { key: number; kind: "ok" | "wa" | "bad" | "info"; title: string; body?: string };
type Metrics = { p50: number; p95: number; docCount: number; sampleSize: number };
type HoState = "live" | "pending" | "acked";

function readMode(): { label: string } {
  if (typeof window === "undefined") return { label: "LIVE" };
  const params = new URLSearchParams(window.location.search);
  if (params.get("fixture") === "1") return { label: "FIXTURE" };
  if (params.has("offline") || !navigator.onLine) return { label: "OFFLINE" };
  return { label: "LIVE" };
}

function TypingLineInner() {
  const others = useOthers();
  const typing = others.filter((o) => o.presence?.typing);
  const who = typing.length > 0 ? (typing[0].info?.name ?? `User ${typing[0].connectionId}`) : "";
  return (
    <div id="typing" className={typing.length > 0 ? "show" : ""}>
      <span className="dots">
        <i />
        <i />
        <i />
      </span>
      <span>{who} is typing</span>
    </div>
  );
}

// Template-static avatar stack: shown while Liveblocks connects or when the
// auth stub (W1, 501) refuses the room. Keeps the header pixel-close offline.
function StaticAvatars() {
  return (
    <div className="avatars" aria-label="Presence (offline)">
      <span className="av">
        AR<span className="st" />
      </span>
      <span className="av">
        PK<span className="st" />
      </span>
      <span className="av bot">
        B1<span className="st" />
      </span>
    </div>
  );
}

class LiveErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Liveblocks auth stub answers 501 until provisioned; the shell stays up.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SafePresence() {
  return (
    <LiveErrorBoundary fallback={<StaticAvatars />}>
      <ClientSideSuspense fallback={<StaticAvatars />}>
        <PresenceAvatars />
      </ClientSideSuspense>
    </LiveErrorBoundary>
  );
}

function TypingLine() {
  return (
    <LiveErrorBoundary fallback={<div id="typing" />}>
      <ClientSideSuspense fallback={<div id="typing" />}>
        <TypingLineInner />
      </ClientSideSuspense>
    </LiveErrorBoundary>
  );
}

function RoomShell({ id }: { id: string }) {
  const roomId = `war-${id}`;
  const [lastMs, setLastMs] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({ p50: 0, p95: 0, docCount: 0, sampleSize: 0 });
  const [latHist, setLatHist] = useState<number[]>([]);
  const [tab, setTab] = useState<"agent" | "approval" | "handoff" | "slo">("agent");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palQ, setPalQ] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [hoState, setHoState] = useState<HoState>("live");
  const [acked, setAcked] = useState(false);
  const [qn, setQn] = useState(0);
  const [askedOnce, setAskedOnce] = useState(false);
  const [agentDown, setAgentDown] = useState(false);
  const [clock, setClock] = useState("--:--:--");
  const [modeMenu, setModeMenu] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [modeLabel, setModeLabel] = useState("LIVE");
  const [agentPhase, setAgentPhase] = useState("attached to session…");
  const toastSeq = useRef(0);
  const sparkRef = useRef<HTMLCanvasElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabIndRef = useRef<HTMLSpanElement>(null);

  const pushToast = useCallback((kind: Toast["kind"], title: string, body?: string) => {
    const key = ++toastSeq.current;
    setToasts((prev) => [...prev.slice(-3), { key, kind, title, body }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.key !== key)), 4200);
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) return;
      const body = (await res.json()) as Metrics;
      if (typeof body.p50 === "number") setMetrics(body);
    } catch {
      // best-effort HUD data.
    }
  }, []);

  useEffect(() => {
    setModeLabel(readMode().label);
    void refreshMetrics();
    const tick = () => {
      const d = new Date();
      setClock(
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`,
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    const onPalette = () => {
      setPalQ("");
      setPaletteOpen(true);
    };
    window.addEventListener("baton:palette", onPalette);
    const onPhase = (e: Event) => {
      const phase = (e as CustomEvent<string>).detail;
      const label =
        phase === "thinking"
          ? "reading the feed…"
          : phase === "searching"
            ? "validating against the session…"
            : phase === "writing"
              ? "writing a cited answer…"
              : phase === "complete"
                ? "answer posted to war-feed…"
                : phase === "blocked"
                  ? "turn blocked — isolation_violation logged…"
                  : "attached to session…";
      setAgentPhase(label);
    };
    window.addEventListener("baton:agent-status", onPhase);
    return () => {
      clearInterval(iv);
      window.removeEventListener("baton:palette", onPalette);
      window.removeEventListener("baton:agent-status", onPhase);
    };
  }, [refreshMetrics]);

  useEffect(() => {
    document.body.classList.toggle("l-off", !leftOpen);
    document.body.classList.toggle("r-off", !rightOpen);
    document.body.classList.toggle("drawer", drawer);
    try {
      localStorage.setItem("bt-ui", JSON.stringify({ l: leftOpen, r: rightOpen }));
    } catch {
      // non-fatal.
    }
  }, [leftOpen, rightOpen, drawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalQ("");
        setPaletteOpen((v) => !v);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setLeftOpen((v) => !v);
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setRightOpen((v) => !v);
      } else if (e.key === "?" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        setHelpOpen(true);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setHelpOpen(false);
        setCloseOpen(false);
        setModeMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Slide the ops-tab indicator under the active tab.
  useEffect(() => {
    const btn = tabRefs.current[tab];
    const ind = tabIndRef.current;
    if (btn && ind && btn.parentElement) {
      const parent = btn.parentElement.getBoundingClientRect();
      const r = btn.getBoundingClientRect();
      ind.style.width = `${r.width}px`;
      ind.style.transform = `translateX(${r.left - parent.left}px)`;
    }
  }, [tab, rightOpen]);

  // SLO sparkline from observed latencies.
  useEffect(() => {
    const cv = sparkRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = (cv.width = cv.offsetWidth || 300);
    const H = (cv.height = 66);
    ctx.clearRect(0, 0, W, H);
    const data = latHist.slice(-40);
    if (data.length === 0) return;
    const max = Math.max(2000, ...data);
    const bw = Math.max(2, Math.floor(W / 40) - 2);
    data.forEach((v, i) => {
      const h = Math.max(2, (v / max) * (H - 8));
      const over = v > 800;
      ctx.fillStyle = over ? "#D9A441" : "#5DBB8A";
      if (document.documentElement.dataset.theme === "light") {
        ctx.fillStyle = over ? "#8F6A16" : "#237C51";
      }
      ctx.fillRect(i * (bw + 2), H - h, bw, h);
    });
    ctx.fillStyle = "#757266";
    ctx.fillRect(0, H - (800 / max) * (H - 8), W, 1);
  }, [latHist, tab]);

  function onResult(ms: number) {
    setLastMs(ms);
    setLatHist((prev) => [...prev.slice(-39), ms]);
    setQn((n) => n + 1);
    setAskedOnce(true);
    void refreshMetrics();
  }

  function catchup() {
    window.dispatchEvent(new Event("baton:catchup"));
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast("ok", `${label} copied`, text);
    } catch {
      pushToast("wa", "Copy failed", text);
    }
  }

  async function handoffStub(action: "initiate" | "close") {
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, roomId, actor: "arun.m" }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: res.ok, error: body?.error ?? `handoff ${action} failed (${res.status})` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function initiateHandoff() {
    const r = await handoffStub("initiate");
    // T5 owns gates; the 501 stub is expected — keep the demo moving locally
    // while saying so out loud.
    setHoState("pending");
    setTab("handoff");
    pushToast(
      r.ok ? "ok" : "wa",
      r.ok ? "Handoff initiated" : `Handoff stub (${r.error})`,
      r.ok ? "Waiting for successor ACK." : "Showing pending locally — gates land in T5.",
    );
  }

  async function closeRoom() {
    const r = await handoffStub("close");
    if (r.ok) {
      setCloseOpen(false);
      setSealed(true);
    } else {
      pushToast("wa", "Close blocked (409)", r.error);
    }
  }

  const verdict =
    metrics.sampleSize === 0
      ? { text: "NO PROBE YET", cls: "" }
      : metrics.p50 <= 800 && metrics.p95 <= 2000
        ? { text: "SLO PASS", cls: "pass" }
        : { text: "SLO FAIL", cls: "fail" };

  const commands = [
    { name: "Catch up on context", hint: "/api/catchup", run: catchup },
    { name: "Toggle sidebar", hint: "⌘B", run: () => setLeftOpen((v) => !v) },
    { name: "Toggle ops panel", hint: "⌘J", run: () => setRightOpen((v) => !v) },
    { name: "Go to SLO tab", hint: "metrics", run: () => setTab("slo") },
    { name: "Copy room id", hint: roomId, run: () => void copyText(roomId, "Room id") },
    { name: "Help & glossary", hint: "?", run: () => setHelpOpen(true) },
  ].filter((c) => c.name.toLowerCase().includes(palQ.toLowerCase()));

  const pillCls =
    modeLabel === "FIXTURE" ? "m-fixture" : modeLabel === "OFFLINE" ? "m-offline" : "";

  return (
    <div id="viewApp">
      <header id="appHeader">
        <button
          id="btnMenu"
          className="icobtn"
          aria-label="Menu"
          onClick={() => setDrawer((v) => !v)}
          type="button"
        >
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="abrand">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 17 17 7" stroke="var(--warn)" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="5.5" cy="18.5" r="2" fill="var(--warn)" />
            <circle cx="18.5" cy="5.5" r="2" fill="var(--warn)" />
          </svg>
          <b>Baton</b>
        </div>
        <div className="incident" title="INC-2041 — checkout 5xx spike">
          <span className="iid">INC-2041</span>
          <span className="ttl">checkout 5xx spike</span>
          <span className="sev">SEV1</span>
        </div>
        <span className="sp" />
        <div className="mw">
          <button id="pillMode" className={pillCls} onClick={() => setModeMenu((v) => !v)} type="button">
            <span className="dot" />
            <span id="pillTxt">{modeLabel}</span>
          </button>
          <div id="modeMenu" role="menu" className={modeMenu ? "open" : ""}>
            <div className="mm-t">CHANNEL MODE</div>
            <a className={`mm-item${modeLabel === "LIVE" ? " on" : ""}`} href={`/room/${id}`}>
              <span className="rd" />
              <span>
                <b>Live</b>
                <span className="d2">Full session — real retrieval, real latency accounting.</span>
              </span>
            </a>
            <a
              className={`mm-item${modeLabel === "FIXTURE" ? " on" : ""}`}
              href={`/room/${id}?fixture=1`}
            >
              <span className="rd" />
              <span>
                <b>Fixture</b>
                <span className="d2">?fixture=1 — canned SOP corpus, zero retrieval calls billed.</span>
              </span>
            </a>
            <a
              className={`mm-item${modeLabel === "OFFLINE" ? " on" : ""}`}
              href={`/room/${id}?offline`}
            >
              <span className="rd" />
              <span>
                <b>Offline</b>
                <span className="d2">?offline — feed stays readable; writes queue to the outbox.</span>
              </span>
            </a>
            <div className="mm-warn">Switching back from Offline replays queued writes in order.</div>
          </div>
        </div>
        <SafePresence />
        <button
          className={`icobtn${leftOpen ? "" : " dim"}`}
          id="btnSb"
          title="Toggle sidebar (⌘B)"
          onClick={() => setLeftOpen((v) => !v)}
          type="button"
        >
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9.5 4v16" />
          </svg>
        </button>
        <button
          className={`icobtn${rightOpen ? "" : " dim"}`}
          id="btnOps"
          title="Toggle ops panel (⌘J)"
          onClick={() => setRightOpen((v) => !v)}
          type="button"
        >
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M14.5 4v16" />
          </svg>
        </button>
        <ThemeToggle />
        <button
          className="icobtn"
          id="btnHelp"
          aria-label="Help"
          onClick={() => setHelpOpen(true)}
          type="button"
        >
          <svg className="ic" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.9c-.7.3-1 .8-1 1.6" />
            <path d="M12 16.6v.01" />
          </svg>
        </button>
        <div className="hclock">
          <b>{clock}</b>
          <span>INC+00:26</span>
        </div>
      </header>

      <div id="sync" className={agentDown ? "show bad" : ""}>
        <span className="spin" />
        <span>{agentDown ? "AGENT DETACHED — QUESTIONS PARKED" : "RESUMING SESSION…"}</span>
      </div>

      <div id="layout">
        <aside id="left">
          <div className="pin">
            <div className="pinScroll">
              <div>
                <div className="sb-t">INCIDENT</div>
                <div className="card">
                  <div className="inc-head">
                    <span className="sev">SEV1</span>
                    <span className="ttl">Checkout 5xx spike</span>
                  </div>
                  <p className="inc-sub">
                    ~30% of checkout sessions erroring since 13:50 UTC. Deploy v41.8 is prime
                    suspect.
                  </p>
                  <div className="inc-rows">
                    <div className="r">
                      <span>Owner</span>
                      <span>{acked ? "p.krishnan" : "arun.m"}</span>
                    </div>
                    <div className="r">
                      <span>Deploy freeze</span>
                      <span className="tag-ok">ENGAGED</span>
                    </div>
                    <div className="r">
                      <span>Rollback</span>
                      <span className="tag-wa">STAGED · 0/2</span>
                    </div>
                    <div className="r">
                      <span>Opened</span>
                      <span>26 min ago</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="sb-t">IN THE ROOM</div>
                <div className="card" style={{ padding: "7px 12px" }}>
                  <div className="person">
                    <span className="av">
                      AR<span className="st" />
                    </span>
                    <div>
                      <div className="pn">arun.m</div>
                      <div className="pr">Primary on-call · you</div>
                    </div>
                    <span className="ps">OWNER</span>
                  </div>
                  <div className="person">
                    <span className="av">
                      PK<span className="st" />
                    </span>
                    <div>
                      <div className="pn">priya.k</div>
                      <div className="pr">Comms lane</div>
                    </div>
                    <span className="ps">ONLINE</span>
                  </div>
                  <div className="person">
                    <span className="av bot">
                      B1<span className="st" />
                    </span>
                    <div>
                      <div className="pn">
                        baton-1 <i>· agent</i>
                      </div>
                      <div className="pr">Gemini Flash</div>
                    </div>
                    <span className="ps">{agentDown ? "KILLED" : "BOOT"}</span>
                  </div>
                </div>
              </div>
              <div id="guideCard">
                <div id="guideHead">
                  <svg className="ic" viewBox="0 0 24 24">
                    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
                  </svg>
                  <b>Try the loop</b>
                  <span id="guideCount">{askedOnce ? "1/5" : "0/5"}</span>
                </div>
                <div className="card" style={{ marginTop: 7, padding: "8px 12px" }}>
                  <div className={`gitem${askedOnce ? " done" : ""}`}>
                    <span className="gbx">✓</span>
                    <span>Ask a question</span>
                  </div>
                  <div className="gitem">
                    <span className="gbx">✓</span>
                    <span>Open a citation</span>
                  </div>
                  <div className="gitem">
                    <span className="gbx">✓</span>
                    <span>Sign the rollback</span>
                  </div>
                  <div className="gitem">
                    <span className="gbx">✓</span>
                    <span>Start a handoff</span>
                  </div>
                  <div className="gitem">
                    <span className="gbx">✓</span>
                    <span>Accept the baton</span>
                  </div>
                  <button
                    className="g-dismiss"
                    onClick={() => pushToast("info", "Checklist hidden for this session")}
                    type="button"
                  >
                    hide checklist
                  </button>
                </div>
              </div>
              <div>
                <div className="sb-t">ACTIONS</div>
                <div className="sb-actions">
                  <button className="sb-btn" onClick={catchup} type="button">
                    <svg className="ic" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 7.5V12l3 2" />
                    </svg>
                    Catch up on context
                  </button>
                  <button
                    className="sb-btn"
                    onClick={() => {
                      setPalQ("");
                      setPaletteOpen(true);
                    }}
                    type="button"
                  >
                    <svg className="ic" viewBox="0 0 24 24">
                      <path d="M5 7h14M5 12h14M5 17h9" />
                    </svg>
                    All commands<kbd>⌘K</kbd>
                  </button>
                  <button className="sb-btn" onClick={() => setHelpOpen(true)} type="button">
                    <svg className="ic" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.9c-.7.3-1 .8-1 1.6" />
                      <path d="M12 16.6v.01" />
                    </svg>
                    Help &amp; glossary
                  </button>
                  <button
                    className="sb-btn"
                    onClick={() => void copyText(roomId, "Room id")}
                    type="button"
                  >
                    <svg className="ic" viewBox="0 0 24 24">
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                    Copy room id
                  </button>
                </div>
              </div>
              <div className="sb-foot">
                <div>
                  <b>{roomId}</b> · iad1
                </div>
                <div>moss · 1 index · 20 SOPs</div>
                <div>pg outbox · reconciler 5m</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="grip" id="gripL" title="Drag to resize · double-click to reset" />

        <main id="center">
          <div className="feedhead">
            <span className="fh-t">WAR FEED · INC-2041</span>
            <span id="evCount">{qn === 0 ? "— events" : `${qn} quer${qn === 1 ? "y" : "ies"}`}</span>
            <OfflineBadge />
            <LatencyHud lastMs={lastMs} />
            <span className="sp" />
            <button className="qc" onClick={catchup} style={{ fontSize: 12 }} type="button">
              catch up
            </button>
          </div>
          <div id="hoBanner" className={hoState === "pending" ? "show" : ""}>
            <span className="ringw">
              <svg width="42" height="42" viewBox="0 0 42 42">
                <circle className="rb" cx="21" cy="21" r="16.5" fill="none" strokeWidth="2.5" />
                <circle
                  id="hoArc"
                  cx="21"
                  cy="21"
                  r="16.5"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="103.7"
                  strokeDashoffset="0"
                />
              </svg>
              <span id="hoTime">10:00</span>
            </span>
            <div>
              <div className="hob-t">Baton is out — waiting for p.krishnan</div>
              <div className="hob-s">
                Close is blocked (409) until the successor accepts ownership. Window: 10 min,
                fail-closed.
              </div>
            </div>
            <div className="hob-actions">
              <button className="btn" onClick={() => setHoState("live")} type="button">
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => setTab("handoff")}
                type="button"
              >
                Take over
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
            <div id="scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              <div id="inner">
                {welcomeVisible && (
                  <div className="welcome">
                    <b>
                      <svg className="ic" viewBox="0 0 24 24">
                        <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
                      </svg>
                      You joined mid-incident
                    </b>
                    <p>
                      Two humans and the Baton agent are already working a SEV1. Start typing to
                      search the room&apos;s knowledge, open a citation, sign the staged rollback,
                      or run a full handoff — the <b>Try the loop</b> checklist walks the demo.
                    </p>
                    <button
                      id="welcomeX"
                      aria-label="Dismiss"
                      onClick={() => setWelcomeVisible(false)}
                      type="button"
                    >
                      <svg className="ic" style={{ width: 13, height: 13 }} viewBox="0 0 24 24">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="sysline k-ok">
                  <b>ATTACH</b>
                  <span>baton-1 joined · replayed ck_9f2 → head · 0 repeat</span>
                </div>
                <div className="sysline k-wa">
                  <b>FREEZE</b>
                  <span>deploy freeze engaged per SOP-006</span>
                </div>
                <ol id="feed" aria-label="Incident event log" />
                <div id="anslist" />
                <TypingLine />
              </div>
            </div>
          </div>
          <SearchBox roomId={roomId} onResult={onResult} mountId="anslist" />
        </main>

        <div className="grip" id="gripR" title="Drag to resize · double-click to reset" />

        <aside id="right">
          <div className="pin">
            <div id="opsTabs">
              {(["agent", "approval", "handoff", "slo"] as const).map((t) => (
                <button
                  key={t}
                  ref={(el) => {
                    tabRefs.current[t] = el;
                  }}
                  className={`ops-tab${tab === t ? " on" : ""}`}
                  data-tab={t}
                  onClick={() => setTab(t)}
                  type="button"
                >
                  {t === "agent" ? "Agent" : t === "approval" ? "Approval" : t === "handoff" ? "Handoff" : "SLO"}
                </button>
              ))}
              <span id="tabInd" ref={tabIndRef} />
            </div>
            <div className={`ops-pane${tab === "agent" ? " on" : ""}`} id="pane-agent">
              <div className="pane-t">baton-1</div>
              <div className="pane-s">
                War-room agent · Gemini Flash · <span className="mono">{roomId}</span>
              </div>
              <div className="stat-led">
                <span className={`led${agentDown ? " dead" : " ok"}`} />
                <span id="agStatus">{agentDown ? "DETACHED" : "LIVE"}</span>
              </div>
              <div id="agTask">{agentDown ? "questions parking to the logbook…" : agentPhase}</div>
              <div className="kv">
                <div className="r">
                  <span>Logbook coverage</span>
                  <span>78%</span>
                </div>
                <div className="covbar">
                  <i style={{ width: "78%" }} />
                </div>
                <div className="r">
                  <span>Last checkpoint</span>
                  <span>ck_9f2</span>
                </div>
                <div className="r">
                  <span>Repeat questions</span>
                  <span>0</span>
                </div>
                <div className="r">
                  <span>Queries this session</span>
                  <span>{qn}</span>
                </div>
              </div>
              <div className="pane-actions">
                <button
                  className="btn blk"
                  onClick={() => pushToast("ok", "Checkpoint written", "ck logged to the outbox (stub).")}
                  type="button"
                >
                  Write checkpoint now
                </button>
                {!agentDown ? (
                  <button
                    className="btn dgr blk"
                    onClick={() => {
                      setAgentDown(true);
                      pushToast("wa", "Agent killed (S2)", "Successor can resume from ck_9f2.");
                    }}
                    type="button"
                  >
                    Simulate agent kill (S2)
                  </button>
                ) : (
                  <button
                    className="btn primary blk"
                    onClick={() => {
                      setAgentDown(false);
                      pushToast("ok", "Successor attached", "Replayed logbook · 0 repeat questions.");
                    }}
                    type="button"
                  >
                    Attach successor agent
                  </button>
                )}
              </div>
              <p className="dim-note">
                Kill removes the agent mid-incident. A successor resumes from the checkpointed
                logbook — questions asked meanwhile are answered on attach, with zero repeat
                questions.
              </p>
            </div>
            <div className={`ops-pane${tab === "approval" ? " on" : ""}`} id="pane-approval">
              <div className="pane-t">Rollback v41.8 → v41.7</div>
              <div className="pane-s">
                Two distinct humans on the same payload hash, inside a 10-minute window. Nothing
                executes unsigned.
              </div>
              <div className="hashrow">
                <svg className="ic" style={{ width: 13, height: 13 }} viewBox="0 0 24 24">
                  <circle cx="8" cy="15.5" r="4" />
                  <path d="M11 12.5 20 3.5" />
                  <path d="M17.5 6.5l2.5 2.5" />
                </svg>
                payloadHash&nbsp;<b>a94f06e9…d31c2</b>
                <button
                  aria-label="Copy hash"
                  onClick={() => void copyText("a94f06e9d31c2", "Payload hash")}
                  type="button"
                >
                  <svg className="ic" style={{ width: 12, height: 12 }} viewBox="0 0 24 24">
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                </button>
              </div>
              <div className="signers">
                <div className="signer">
                  <span className="ring">
                    <svg className="ic" viewBox="0 0 24 24">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                  <div>
                    <div className="sn">arun.m</div>
                    <div className="sr">Primary on-call · you</div>
                  </div>
                  <span className="ss">WAITING</span>
                </div>
                <div className="signer">
                  <span className="ring">
                    <svg className="ic" viewBox="0 0 24 24">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                  <div>
                    <div className="sn">priya.k</div>
                    <div className="sr">Comms lead</div>
                  </div>
                  <span className="ss">WAITING</span>
                </div>
              </div>
              <CoSignTile roomId={roomId} action="rollback" />
              <button
                className="lnk"
                onClick={() => void copyText("a94f06e9d31c2", "Payload hash")}
                type="button"
              >
                Copy payload hash
              </button>
            </div>
            <div className={`ops-pane${tab === "handoff" ? " on" : ""}`} id="pane-handoff">
              <div className="pane-t">Ownership</div>
              <div className="pane-s">
                Handoffs are explicit, never ambient. The baton only moves when a successor ACKs —
                until then the room can&apos;t close.
              </div>
              <div className="stepper">
                <span className={`stp${hoState === "live" ? " on" : " done"}`}>
                  <span className="d" />
                  <em>LIVE</em>
                </span>
                <span className={`sbar${hoState !== "live" ? " done" : ""}`}>
                  <i style={{ width: hoState !== "live" ? "100%" : 0 }} />
                </span>
                <span className={`stp${hoState === "pending" ? " on" : hoState === "acked" ? " done" : ""}`}>
                  <span className="d" />
                  <em>PENDING</em>
                </span>
                <span className={`sbar${hoState === "acked" ? " done" : ""}`}>
                  <i style={{ width: hoState === "acked" ? "100%" : 0 }} />
                </span>
                <span className={`stp${hoState === "acked" ? " on" : ""}`}>
                  <span className="d" />
                  <em>ACKED</em>
                </span>
              </div>
              <div className="ho-rows">
                <div className="r">
                  <span>Owner</span>
                  <span>{acked ? "p.krishnan" : "arun.m"}</span>
                </div>
                <div className="r">
                  <span>State</span>
                  <span className="tag-ok">{hoState.toUpperCase()}</span>
                </div>
                <div className="r">
                  <span>Close gate</span>
                  <span>{acked ? "OPEN — ACK on record" : "LOCKED until ACK"}</span>
                </div>
              </div>
              <div className="pane-actions">
                {hoState === "live" ? (
                  <button className="btn primary blk" onClick={() => void initiateHandoff()} type="button">
                    Initiate handoff
                  </button>
                ) : (
                  <AckModal
                    roomId={roomId}
                    label="Take over (ACK)"
                    onAck={() => {
                      setAcked(true);
                      setHoState("acked");
                      pushToast("ok", "Ownership ACK recorded", "Close gate is open.");
                    }}
                  />
                )}
                <button className="btn dgr blk" onClick={() => setCloseOpen(true)} type="button">
                  Close room…
                </button>
              </div>
            </div>
            <div className={`ops-pane${tab === "slo" ? " on" : ""}`} id="pane-slo">
              <div className="pane-t">Query latency</div>
              <div className="pane-s">
                Binding targets: p50 ≤ 800ms, p95 ≤ 2000ms over the session probe.
              </div>
              <div className="tiles">
                <div className="tile">
                  <em>LAST</em>
                  <b>
                    <span>{lastMs}</span>
                    <small>ms</small>
                  </b>
                </div>
                <div className="tile">
                  <em>P50</em>
                  <b>
                    <span>{metrics.p50}</span>
                    <small>ms</small>
                  </b>
                </div>
                <div className="tile">
                  <em>P95</em>
                  <b>
                    <span>{metrics.p95}</span>
                    <small>ms</small>
                  </b>
                </div>
              </div>
              <span id="chipVerdict" className={verdict.cls}>
                {verdict.text}
              </span>
              <canvas id="spark" height={66} ref={sparkRef} />
              <div className="ltmeta">
                <span>
                  n = <span>{metrics.sampleSize}</span> queries
                </span>
                <span>guides 800ms / 2000ms</span>
              </div>
              <div className="pane-actions">
                <button
                  className="btn primary blk"
                  onClick={() => {
                    void refreshMetrics();
                    pushToast("info", "Probe mirrors scripts/latency-probe.mjs", "Full 20-query probe lands in T5.");
                  }}
                  type="button"
                >
                  Run 20-query probe
                </button>
              </div>
              <p className="dim-note">
                Fires 20 timed queries against the session, then recomputes p50/p95 and the SLO
                verdict — mirrors <span className="mono">scripts/latency-probe.mjs</span>.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <button className="edgeTab" id="sbEdge" title="Show sidebar (⌘B)" onClick={() => setLeftOpen(true)} type="button">
        <svg className="ic" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9.5 4v16" />
        </svg>
      </button>
      <button className="edgeTab" id="opsEdge" title="Show ops panel (⌘J)" onClick={() => setRightOpen(true)} type="button">
        <svg className="ic" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M14.5 4v16" />
        </svg>
      </button>

      <div id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast ${t.kind}`} key={t.key}>
            <svg className="ic" viewBox="0 0 24 24">
              {t.kind === "ok" ? (
                <path d="M4 12.5l5 5L20 6.5" />
              ) : (
                <path d="M12 3.5 2.5 20h19L12 3.5z" />
              )}
            </svg>
            <div>
              <div className="tt">{t.title}</div>
              {t.body && <div className="tb">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>

      {closeOpen && (
        <div id="scrim" className="show" onClick={() => setCloseOpen(false)} role="presentation">
          <div
            className="modal show"
            role="dialog"
            aria-modal="true"
            aria-label="Close war-room"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              <svg className="ic" viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Close war-room
            </h3>
            <p className="ms">
              You&apos;re closing <b>INC-2041</b> as <b>arun.m</b>. This seals the logbook, writes
              the close event to the audit trail, and freezes the session read-only.{" "}
              {acked
                ? "Ownership ACK is on record, so the gate is open."
                : "No ACK is on record — close returns 409 PENDING_HANDOFF until the successor ACKs."}
            </p>
            <div className="mrow2">
              <button className="btn" onClick={() => setCloseOpen(false)} type="button">
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => void closeRoom()}
                type="button"
              >
                Close &amp; seal room
              </button>
            </div>
          </div>
        </div>
      )}

      {sealed && (
        <div id="scrim" className="show" role="presentation">
          <div className="modal show" role="dialog" aria-modal="true" aria-label="Room sealed">
            <h3>
              <svg className="ic" style={{ color: "var(--ok)" }} viewBox="0 0 24 24">
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
              Room sealed
            </h3>
            <p className="ms">
              Ownership ACK recorded. The logbook is sealed and the close event is written to the
              audit trail. Context stays queryable read-only for the postmortem.
            </p>
            <div className="cogrid">
              <div>
                <div className="k">DURATION</div>
                <div className="v">26m</div>
              </div>
              <div>
                <div className="k">EVENTS</div>
                <div className="v">{qn + 2}</div>
              </div>
              <div>
                <div className="k">QUERIES</div>
                <div className="v">{qn}</div>
              </div>
              <div>
                <div className="k">P50</div>
                <div className="v">{metrics.p50}ms</div>
              </div>
              <div>
                <div className="k">P95</div>
                <div className="v">{metrics.p95}ms</div>
              </div>
              <div>
                <div className="k">REPEAT Q</div>
                <div className="v">0</div>
              </div>
            </div>
            <div className="mrow2">
              <button
                className="btn"
                onClick={() => void copyText(`INC-2041 sealed · ${qn} queries · p50 ${metrics.p50}ms · p95 ${metrics.p95}ms · 0 repeats`, "Postmortem summary")}
                type="button"
              >
                Copy postmortem summary
              </button>
              <button className="btn primary" onClick={() => setSealed(false)} type="button">
                View read-only feed
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div id="scrim" className="show" onClick={() => setHelpOpen(false)} role="presentation">
          <div
            className="modal show"
            role="dialog"
            aria-modal="true"
            aria-label="How this room works"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              <svg className="ic" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.9c-.7.3-1 .8-1 1.6" />
                <path d="M12 16.6v.01" />
              </svg>
              How this room works
            </h3>
            <div className="hgrid">
              <div className="hcol">
                <h4>SHORTCUTS</h4>
                <div className="hk">
                  <span>Command palette</span>
                  <kbd>⌘K</kbd>
                </div>
                <div className="hk">
                  <span>Toggle sidebar</span>
                  <kbd>⌘B</kbd>
                </div>
                <div className="hk">
                  <span>Toggle ops panel</span>
                  <kbd>⌘J</kbd>
                </div>
                <div className="hk">
                  <span>Help</span>
                  <kbd>?</kbd>
                </div>
                <div className="hk">
                  <span>Close overlay</span>
                  <kbd>Esc</kbd>
                </div>
              </div>
              <div className="hcol">
                <h4>GLOSSARY</h4>
                <div className="gl">
                  <b>Logbook</b>
                  <span>The room&apos;s shared memory. Every answer, decision and event is checkpointed into it.</span>
                </div>
                <div className="gl">
                  <b>Checkpoint</b>
                  <span>A save point (push_index). Successors resume from the latest one with zero repeat questions.</span>
                </div>
                <div className="gl">
                  <b>Co-sign</b>
                  <span>Two distinct humans must sign the same payload hash before a staged action executes.</span>
                </div>
                <div className="gl">
                  <b>W = 10 min</b>
                  <span>The signature window. Expire unsigned → the action cancels. Fail-closed.</span>
                </div>
                <div className="gl">
                  <b>409 gate</b>
                  <span>A room with a pending handoff can&apos;t be closed until the successor ACKs ownership.</span>
                </div>
              </div>
            </div>
            <div className="mrow2">
              <button className="btn primary" onClick={() => setHelpOpen(false)} type="button">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div id="palette" role="dialog" aria-label="Command palette" className="show">
          <div className="palin">
            <svg className="ic" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              id="palInput"
              placeholder="Run a command…"
              autoComplete="off"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={palQ}
              onChange={(e) => setPalQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commands[0]) {
                  commands[0].run();
                  setPaletteOpen(false);
                }
              }}
            />
          </div>
          <div id="palList">
            {commands.map((c) => (
              <div
                key={c.name}
                className="pitem"
                onClick={() => {
                  c.run();
                  setPaletteOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    c.run();
                    setPaletteOpen(false);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span>{c.name}</span>
                <span className="ph">{c.hint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div id="drawerScrim" onClick={() => setDrawer(false)} role="presentation" />
    </div>
  );
}

export default function Room({ id }: { id: string }) {
  // No secrets here: the browser only knows the authEndpoint URL; the
  // LIVEBLOCKS_SECRET_KEY stays server-side in /api/liveblocks-auth.
  // Pattern: LiveblocksProvider (authEndpoint) → RoomProvider (id=war-<id>,
  // initialPresence) → ClientSideSuspense. Docs:
  // https://liveblocks.io/docs/api-reference/liveblocks-react
  // The shell renders immediately; only presence hooks sit behind
  // ClientSideSuspense + an error boundary (auth stub is 501 until W1
  // provisions the secret, so presence degrades to static avatars).
  // Docs: https://liveblocks.io/docs/api-reference/liveblocks-react
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider id={`war-${id}`} initialPresence={{ typing: false }}>
        <RoomShell id={id} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
