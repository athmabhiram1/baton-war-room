"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Citation } from "../lib/answer";
import AnswerCard from "./AnswerCard";

export type FeedAnswer = {
  key: string;
  question: string;
  answer: string;
  citations: Citation[];
  ms: number;
  pending?: boolean;
};

// Canned SOP docs for ?fixture=1: zero Moss calls, answered locally.
const FIXTURE_ANSWERS: Array<{ answer: string; citations: Citation[]; ms: number }> = [
  {
    answer: "FIXTURE: Sev1 triage — page the incident commander, freeze deploys, open the war-room.",
    citations: [
      { id: "sev1-triage", score: 1.0, text: "FIXTURE canned doc: SEV1 triage runbook." },
      { id: "deploy-freeze", score: 0.92, text: "FIXTURE canned doc: deploy freeze runbook." },
    ],
    ms: 1,
  },
];

const CHIPS = [
  "Why are we seeing 5xx on checkout?",
  "What's the rollback plan right now?",
  "Who do we escalate to and when?",
];

const SUGGESTIONS = [
  ...CHIPS,
  "How does handoff ownership work?",
  "How is our latency SLO doing?",
  "Is this a cache stampede?",
  "Can we still ship during the freeze?",
  "Catch me up on context so far",
];

function isFixture(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fixture") === "1";
}

function isOfflineMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("offline") || !navigator.onLine;
}

// War-room composer: quick chips + suggestions POST /api/query, catch-up
// POSTs /api/catchup, answers render as AnswerCard feed items (with live
// citations + score + ms) portaled into the feed mount.
export default function SearchBox({
  roomId,
  onResult,
  mountId = "anslist",
}: {
  roomId?: string;
  onResult?: (ms: number) => void;
  mountId?: string;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<FeedAnswer[]>([]);
  const [mount, setMount] = useState<Element | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugHi, setSugHi] = useState(0);
  const [offline, setOffline] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keySeq = useRef(0);

  useEffect(() => {
    setMount(document.getElementById(mountId));
    setOffline(isOfflineMode());
    const flip = () => setOffline(isOfflineMode());
    window.addEventListener("online", flip);
    window.addEventListener("offline", flip);
    const onCatchup = () => void catchup();
    window.addEventListener("baton:catchup", onCatchup);
    return () => {
      window.removeEventListener("online", flip);
      window.removeEventListener("offline", flip);
      window.removeEventListener("baton:catchup", onCatchup);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountId]);

  function pushAnswer(a: Omit<FeedAnswer, "key">): FeedAnswer {
    const next = { ...a, key: `a${Date.now()}-${keySeq.current++}` };
    setAnswers((prev) => [...prev, next]);
    return next;
  }

  async function ask(query: string) {
    const question = query.trim();
    if (question.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    setSugOpen(false);

    // ?fixture=1: answer from canned docs, no Moss/network call.
    if (isFixture()) {
      const canned = FIXTURE_ANSWERS[0];
      pushAnswer({
        question,
        answer: `FIXTURE answer for "${question}": ${canned.answer}`,
        citations: canned.citations,
        ms: canned.ms,
      });
      onResult?.(canned.ms);
      setLoading(false);
      setQ("");
      return;
    }

    const pendingKey = `p${Date.now()}-${keySeq.current++}`;
    setAnswers((prev) => [
      ...prev,
      { key: pendingKey, question, answer: "", citations: [], ms: 0, pending: true },
    ]);

    const t0 = performance.now();
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(roomId ? { q: question, roomId } : { q: question }),
      });
      const body = (await res.json()) as {
        citations?: Citation[];
        timeTakenInMs?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `query failed (${res.status})`);
        setAnswers((prev) => prev.filter((a) => a.key !== pendingKey));
        return;
      }
      const ms =
        typeof body.timeTakenInMs === "number"
          ? body.timeTakenInMs
          : Math.round(performance.now() - t0);
      // score each citation for display; AnswerCard shows id + score + ms.
      const citations = (Array.isArray(body.citations) ? body.citations : []).map((c) => ({
        id: c.id,
        score: c.score,
        text: c.text,
      }));
      const cited = citations
        .slice(0, 5)
        .map((c) => `[${c.id} score=${c.score}] ${c.text.slice(0, 280)}`)
        .join("\n\n");
      setAnswers((prev) =>
        prev.map((a) =>
          a.key === pendingKey
            ? { ...a, answer: cited.length > 0 ? cited : "No citations returned.", citations, ms, pending: false }
            : a,
        ),
      );
      onResult?.(ms);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAnswers((prev) => prev.filter((a) => a.key !== pendingKey));
    } finally {
      setLoading(false);
      setQ("");
      inputRef.current?.focus();
    }
  }

  async function catchup() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/catchup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(roomId ? { roomId } : {}),
      });
      const body = (await res.json()) as {
        citations?: Citation[];
        timeTakenInMs?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `catchup failed (${res.status})`);
        return;
      }
      const citations = Array.isArray(body.citations) ? body.citations : [];
      const ms = typeof body.timeTakenInMs === "number" ? body.timeTakenInMs : 0;
      pushAnswer({
        question: "Catch me up on context so far",
        answer:
          citations
            .slice(0, 5)
            .map((c) => `[${c.id} score=${c.score}] ${c.text.slice(0, 280)}`)
            .join("\n\n") || "Logbook is empty — nothing to catch up on yet.",
        citations,
        ms,
      });
      onResult?.(ms);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const sugList =
    q.trim().length === 0
      ? []
      : SUGGESTIONS.filter((s) => s.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!sugOpen || sugList.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSugHi((h) => (h + 1) % sugList.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSugHi((h) => (h - 1 + sugList.length) % sugList.length);
    } else if (e.key === "Tab" && sugList[sugHi]) {
      e.preventDefault();
      setQ(sugList[sugHi]);
    }
  }

  const feed = (
    <div className="anslist" aria-label="Answer feed" aria-live="polite">
      {answers.map((a) =>
        a.pending ? (
          <div className="mg" key={a.key}>
            <span className="mg-av bot">B1</span>
            <div className="mg-col">
              <div className="mg-head">
                <b>baton-1</b>
                <span className="rt">thinking</span>
              </div>
              <div className="ablock">
                <div className="think">
                  <span>{a.question}</span>
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mg" key={a.key}>
            <span className="mg-av">AR</span>
            <div className="mg-col">
              <div className="mg-head">
                <b>you</b>
                <span className="rt">asked</span>
              </div>
              <div className="mg-row">
                <div className="mg-text">{a.question}</div>
              </div>
              <div className="mg" style={{ padding: 0 }}>
                <span className="mg-av bot">B1</span>
                <div className="mg-col">
                  <div className="mg-head">
                    <b>baton-1</b>
                    <span className="rt">cited</span>
                  </div>
                  <AnswerCard answer={a.answer} citations={a.citations} ms={a.ms} />
                </div>
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );

  return (
    <>
      {mount ? createPortal(feed, mount) : feed}
      <footer id="composer">
        <div className="cin">
          <div id="sug" role="listbox" className={sugOpen && sugList.length > 0 ? "open" : ""}>
            <div className="sg-h">SUGGESTIONS</div>
            {sugList.map((s, i) => (
              <button
                key={s}
                className={`sg${i === sugHi ? " on" : ""}`}
                role="option"
                aria-selected={i === sugHi}
                onClick={() => void ask(s)}
                type="button"
              >
                <svg className="ic" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span className="sgl">{s}</span>
              </button>
            ))}
            <div className="sg-f">↑↓ navigate · tab complete · ↵ ask</div>
          </div>
          <div className="chips">
            <span className="chips-l">TRY</span>
            {CHIPS.map((c) => (
              <button key={c} className="qc" onClick={() => void ask(c)} type="button">
                {c.replace(/^(Why are we seeing|What's the|Who do we) /, "").replace(/\?$/, "")}
              </button>
            ))}
          </div>
          <form
            id="qForm"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              if (sugOpen && sugList[sugHi]) void ask(sugList[sugHi]);
              else void ask(q);
            }}
          >
            <span className="sic">
              <svg className="ic" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <input
              id="qInput"
              ref={inputRef}
              type="text"
              spellCheck={false}
              placeholder="Ask the war-room…"
              aria-label="Search"
              value={q}
              disabled={loading}
              onChange={(e) => {
                setQ(e.target.value);
                setSugOpen(true);
                setSugHi(0);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setSugOpen(false), 120)}
              onFocus={() => q.trim().length > 0 && setSugOpen(true)}
            />
            <button
              type="button"
              className="in-kbd"
              title="Command palette (⌘K)"
              onClick={() => window.dispatchEvent(new Event("baton:palette"))}
            >
              ⌘K
            </button>
            <button
              id="sendBtn"
              type="submit"
              aria-label="Send"
              disabled={loading || q.trim().length === 0}
              className={q.trim().length > 0 && !loading ? "ready" : ""}
            >
              <svg className="ic" viewBox="0 0 24 24">
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          </form>
          <div className="fstatus" data-state={offline ? "off" : loading ? "live" : "hints"}>
            <span className="st-hints">
              <kbd>↵</kbd> ask · <kbd>↑↓</kbd> suggestions · <kbd>⌘K</kbd> commands ·{" "}
              <kbd>?</kbd> help
            </span>
            <span className="st-live">
              <span className="sdot" />
              <span>baton-1 is responding</span>
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="st-off">offline — writes buffer to the outbox, replay on reconnect</span>
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--bad)", fontSize: 12.5, marginTop: 4 }}>
              {error}
            </p>
          )}
        </div>
      </footer>
    </>
  );
}
