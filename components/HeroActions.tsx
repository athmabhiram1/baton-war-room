"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Hero client island: room entry buttons + scroll-reveal observer.
// Everything else on the landing page is server-rendered static markup.
export default function HeroActions() {
  const router = useRouter();

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

  function enter() {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(16).slice(2, 10);
    router.push(`/room/${id}`);
  }

  return (
    <button className="btn primary" id="navLaunch" onClick={enter} type="button">
      Launch demo
    </button>
  );
}

export function HeroCtas() {
  const router = useRouter();
  function enter() {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(16).slice(2, 10);
    router.push(`/room/${id}`);
  }
  function scrollToLoop() {
    document.querySelector("#loop")?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <div className="ctas">
      <button className="btn primary" id="ctaEnter" onClick={enter} type="button">
        Enter the war-room
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
