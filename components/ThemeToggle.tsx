"use client";

import { useEffect } from "react";

// data-theme light/dark toggle shared by hero nav + war-room header.
// Reads localStorage bt-theme; falls back to the layout's pre-paint value.
export default function ThemeToggle() {
  useEffect(() => {
    syncIcon();
  }, []);

  function syncIcon() {
    const light = document.documentElement.dataset.theme === "light";
    const svg = light
      ? '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>'
      : '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>';
    document.querySelectorAll(".themeBtn svg").forEach((s) => {
      s.innerHTML = svg;
    });
  }

  function toggle() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("bt-theme", next);
    } catch {
      // storage unavailable — theme still applies for this session.
    }
    syncIcon();
  }

  return (
    <button className="icobtn themeBtn" aria-label="Toggle theme" onClick={toggle} type="button">
      <svg className="ic" viewBox="0 0 24 24">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
      </svg>
    </button>
  );
}
