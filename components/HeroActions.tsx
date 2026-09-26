"use client";

import { useEffect } from "react";

import { OPEN_LOGIN_EVENT, type OpenLoginDetail } from "./SessionGate";

// Hero client island: room entry buttons + scroll-reveal observer.
// Everything else on the landing page is server-rendered static markup.
// Entry buttons NEVER navigate directly: they dispatch baton:open-login and
// SessionGate runs the template gated() flow (open login modal first when
// signed out, then continue to a new room after login).
function requestEntry() {
  window.dispatchEvent(
    new CustomEvent<OpenLoginDetail>(OPEN_LOGIN_EVENT, {
      detail: { action: "new-room" },
    }),
  );
}

export default function HeroActions() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".rv"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <button className="btn primary" id="navLaunch" onClick={requestEntry} type="button">
      Launch demo
    </button>
  );
}

export function HeroCtas() {
  function scrollToLoop() {
    document.querySelector("#loop")?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <div className="ctas">
      <button className="btn primary" id="ctaEnter" onClick={requestEntry} type="button">
        New war-room
        <svg className="ic" viewBox="0 0 24 24">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </button>
      <button className="btn" id="ctaLoop" onClick={scrollToLoop} type="button">
        How the loop works
      </button>
    </div>
  );
}
