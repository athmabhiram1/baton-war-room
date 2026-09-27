import HeroActions, { HeroCtas } from "../components/HeroActions";
import SessionGate from "../components/SessionGate";
import ThemeToggle from "../components/ThemeToggle";

// Server component: hero/landing. Client interactivity lives in
// HeroActions (entry buttons + reveal) and ThemeToggle (data-theme).
export default function Home() {
  return (
    <div id="viewHero">
      <nav className="hnav">
        <div className="brand">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 17 17 7" stroke="var(--warn)" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="5.5" cy="18.5" r="2" fill="var(--warn)" />
            <circle cx="18.5" cy="5.5" r="2" fill="var(--warn)" />
          </svg>
          <b>Baton</b>
        </div>
        <span className="sp" />
        <a href="#loop">The loop</a>
        <a href="#features">Why Baton</a>
        <ThemeToggle />
        <HeroActions />
      </nav>

      <section className="hwrap hero">
        <div>
          <span className="kick">MULTIPLAYER AI · COLLABORATIVE AGENTS</span>
          <h1>
            <span className="ln">
              <i>Hand over the incident,</i>
            </span>
            <span className="ln">
              <i>
                not the <em>guesswork</em>.
              </i>
            </span>
          </h1>
          <p className="sub">
            Baton is a live war-room where two humans and one agent share a single checkpointed
            memory. Anyone can watch, redirect, or take the baton — a successor agent resumes with{" "}
            <b>zero repeat questions</b>, and no room closes without an explicit ACK.
          </p>
          <HeroCtas />
          <SessionGate />
          <div className="hstats" title="SLO targets — live values in the room SLO tab">
            <span className="hstat g" title="SLO target — live values in the room SLO tab">
              <i />p50 ≤ 800 ms
            </span>
            <span className="hstat g">
              <i />0 repeat questions
            </span>
            <span className="hstat a">
              <i />
              409 close gate
            </span>
            <span className="hstat a">
              <i />
              co-sign HITL
            </span>
          </div>
        </div>
        <div className="mock">
          <div className="mock-top">
            <span className="mt">war-7f3a2c · INC-2041 · SEV1 · illustrative preview</span>
            <span className="mlive preview" title="Illustrative preview — not live data">
              <i />
              PREVIEW
            </span>
          </div>
          <div className="mock-feed" aria-label="War-room preview">
            <div className="mrow m-sys">
              <b>ATTACH</b>
              <span>baton-1 joined · replayed ck_9f2 → head</span>
            </div>
            <div className="mrow m-hum">
              <span className="m-av">AR</span>
              <div>
                <div className="mh">arun.m</div>
                <p>Why are we seeing 5xx on checkout?</p>
              </div>
            </div>
            <div className="mrow m-agt">
              <span className="m-av">B1</span>
              <div className="mbox">
                <div className="mh">
                  baton-1 <span className="tag">CITED</span>
                </div>
                <p>
                  Blast radius first: 502/504-dominant errors point upstream. Freeze is engaged, so
                  the queue stays quiet while we attach signatures.
                </p>
                <div className="m-cites">
                  <span className="m-cite">
                    <b>SOP-014</b> 0.94
                  </span>
                  <span className="m-cite">
                    <b>SOP-001</b> 0.91
                  </span>
                  <span className="m-cite">
                    <b>SOP-006</b> 0.77
                  </span>
                </div>
              </div>
            </div>
            <div className="mrow m-ban">
              <b>PENDING</b>
              <span>
                Rollback v41.8 → v41.7 staged · co-sign 0/2 · fail-closed in 10:00
              </span>
            </div>
            <div className="mrow m-sys warn">
              <b>CO-SIGN</b>
              <span>arun.m signed payloadHash a94f06e9…d31c2</span>
            </div>
            <div className="mrow m-sys">
              <b>CHECKPOINT</b>
              <span>
                ✓ ck_9f2 · 13 events · coverage 78% · 0 repeat ·{" "}
                <span className="thinkdots">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </div>
          </div>
          <div className="mock-foot">
            <span>attaching…</span>
            <span className="rail">
              <span className="runner" />
            </span>
            <span>sample p50 412ms · 0 repeat · illustrative preview</span>
          </div>
        </div>
      </section>

      <section className="hwrap sect" id="loop">
        <div className="sect-h rv">
          <h2>
            One loop, <em>five moves</em>.
          </h2>
          <p>
            Every Baton session runs the same contract. The PREVIEW above is a simulated
            illustration; the war-room lets you drive every step yourself with live presence.
          </p>
        </div>
        <div className="loop">
          <div className="lstep rv">
            <span className="n">01</span>
            <b>
              Ask <span className="stag">S1</span>
            </b>
            <p>Anyone in the room asks in the feed — the agent answers with retrieval-backed citations.</p>
          </div>
          <div className="lstep rv" style={{ transitionDelay: ".06s" }}>
            <span className="n">02</span>
            <b>
              Cite <span className="stag">S1</span>
            </b>
            <p>Every answer carries scored sources you can open inline. Repeats come from the logbook.</p>
          </div>
          <div className="lstep rv" style={{ transitionDelay: ".12s" }}>
            <span className="n">03</span>
            <b>
              Co-sign <span className="stag">S3</span>
            </b>
            <p>Risky actions wait for two distinct humans on the same payload hash. Fail-closed, always.</p>
          </div>
          <div className="lstep rv" style={{ transitionDelay: ".18s" }}>
            <span className="n">04</span>
            <b>
              Hand off <span className="stag">S3</span>
            </b>
            <p>Baton out. Close returns 409 until the successor explicitly ACKs ownership.</p>
          </div>
          <div className="lstep rv" style={{ transitionDelay: ".24s" }}>
            <span className="n">05</span>
            <b>
              Resume <span className="stag">S2</span>
            </b>
            <p>The successor replays the checkpointed logbook and picks up with zero repeat questions.</p>
          </div>
        </div>
      </section>

      <section className="hwrap sect" id="features">
        <div className="sect-h rv">
          <h2>
            Built for the <em>3 a.m. page</em>.
          </h2>
          <p>
            Not a chatbot with a sidebar — an operator console with guard rails where it hurts:
            memory, ownership, approvals, latency.
          </p>
        </div>
        <div className="featgrid">
          <div className="feat rv">
            <h3>The logbook is the memory.</h3>
            <p>
              Every answer, decision and event is checkpointed. A successor — human or agent —
              resumes from the last checkpoint instead of starting over.
            </p>
            <div className="fviz">
              <ul className="term">
                <li>
                  <span className="ta">baton-1</span> · rollback staged per SOP-003 ·{" "}
                  <span className="tw">co-sign 0/2</span>
                </li>
                <li>
                  <span className="tc">✓ checkpoint</span> ck_9f2 · 13 events · coverage 78%
                </li>
                <li>
                  <span className="ta">baton-2</span> attached · replayed ck_9e1 → head ·{" "}
                  <span className="tc">0 repeat</span>
                </li>
                <li>
                  <span className="tc">✓ ACK</span> p.krishnan has the baton · close gate open
                </li>
              </ul>
              <div className="kvrow">
                Repeats are served from the logbook — <b>&nbsp;never re-queried</b>
              </div>
            </div>
          </div>
          <div className="feat rv" style={{ transitionDelay: ".07s" }}>
            <h3>Kill the agent. Nothing is lost.</h3>
            <p>
              Detach the agent mid-incident and questions park instead of vanishing. Attach a
              successor: it replays the logbook, then answers everything that piled up.
            </p>
            <div className="fviz">
              <div className="mini-kill">
                <span className="mk-chip dead">baton-1 · KILLED</span>
                <svg className="ic" style={{ color: "var(--ink3)" }} viewBox="0 0 24 24">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
                <span className="mk-chip alive">baton-2 · RESUMED</span>
              </div>
              <div className="kvrow">
                Resume source: <b>&nbsp;logbook + push_index checkpoint</b>
              </div>
            </div>
          </div>
          <div className="feat rv" style={{ transitionDelay: ".04s" }}>
            <h3>Approvals fail closed.</h3>
            <p>
              A rollback executes only with two distinct humans on the same payload hash inside a
              10-minute window. Expire unsigned and the action cancels — never the reverse.
            </p>
            <div className="fviz">
              <div className="mini-cosign">
                <span className="mring on">
                  <svg className="ic" viewBox="0 0 24 24">
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                </span>
                <span className="mring on">
                  <svg className="ic" viewBox="0 0 24 24">
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--ok)",
                    fontWeight: 600,
                    letterSpacing: ".06em",
                  }}
                >
                  2/2 · EXECUTED
                </span>
              </div>
              <div className="kvrow">
                W = 10 min · <b>&nbsp;same payloadHash · distinct humans</b>
              </div>
            </div>
          </div>
          <div className="feat rv" style={{ transitionDelay: ".1s" }}>
            <h3>Latency is a contract.</h3>
            <p>
              The query path is synchronous and small; the SLO is binding. A 20-query probe gates
              the build: p50 ≤ 800ms, p95 ≤ 2000ms — or it doesn&apos;t ship.
            </p>
            <div className="fviz">
              <ul className="term" style={{ animation: "none" }}>
                <li style={{ opacity: 1, animation: "none" }}>
                  <span className="tc">✓ probe</span> 20/20 queries · p50{" "}
                  <span className="tc">412ms</span> · p95 <span className="tc">1380ms</span>
                </li>
                <li style={{ opacity: 1, animation: "none" }}>
                  <span className="tc">✓ verdict</span> SLO PASS · within 800 / 2000 budget
                </li>
              </ul>
              <div className="kvrow">
                Run the probe yourself in the <b>&nbsp;SLO tab</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="stackstrip rv">
        <div className="stackin">
          <span>
            <b>Next.js 16</b> · app router
          </span>
          <span>
            <b>Liveblocks</b> · presence + storage
          </span>
          <span>
            <b>Moss server SDK</b> · 1 index
          </span>
          <span>
            <b>Gemini Flash</b> · guard-railed
          </span>
          <span>
            <b>Postgres</b> · SKIP LOCKED outbox
          </span>
          <span>
            <b>Vercel</b> · iad1 · fluid node
          </span>
        </div>
      </div>

      <footer className="hfoot">
        <span>Baton — shift-handoff war-room · Multiplayer AI &amp; Collaborative Agents track</span>
        <span className="mono">demo · all state is local to your browser</span>
      </footer>
    </div>
  );
}
