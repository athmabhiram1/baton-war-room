"use client";

import { useEffect, useState } from "react";

export type HudMode = "LIVE" | "FIXTURE" | "OFFLINE";

function readMode(): HudMode {
  if (typeof window === "undefined") return "LIVE";
  const params = new URLSearchParams(window.location.search);
  if (params.get("fixture") === "1") return "FIXTURE";
  if (params.has("offline") || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return "OFFLINE";
  }
  return "LIVE";
}

// Compact latency HUD: per-answer ms from props + p50/p95 refreshed from
// /api/metrics, tagged LIVE/FIXTURE/OFFLINE by query param + connectivity.
export default function LatencyHud({
  lastMs,
  mode,
  p50,
  p95,
}: {
  lastMs: number;
  mode?: HudMode;
  p50?: number;
  p95?: number;
}) {
  const [fetched, setFetched] = useState<{ p50: number; p95: number } | null>(null);
  const [liveMode, setLiveMode] = useState<HudMode>(() => mode ?? "LIVE");

  useEffect(() => {
    setLiveMode(mode ?? readMode());
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/metrics");
        if (!res.ok) return;
        const body = (await res.json()) as { p50?: number; p95?: number };
        if (!cancelled && typeof body.p50 === "number" && typeof body.p95 === "number") {
          setFetched({ p50: body.p50, p95: body.p95 });
        }
      } catch {
        // metrics are best-effort; the HUD keeps last-known values.
      }
    }
    void load();
    const onFlip = () => setLiveMode((m) => m ?? readMode());
    window.addEventListener("online", onFlip);
    window.addEventListener("offline", onFlip);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onFlip);
      window.removeEventListener("offline", onFlip);
    };
  }, [mode]);

  const showP50 = p50 ?? fetched?.p50 ?? null;
  const showP95 = p95 ?? fetched?.p95 ?? null;

  return (
    <div
      role="status"
      aria-label={`Latency HUD ${liveMode}`}
      className="mono"
      style={{
        fontSize: 10.5,
        color: "var(--ink3)",
        letterSpacing: ".04em",
        whiteSpace: "nowrap",
      }}
    >
      {liveMode} · {lastMs}ms · p50 {showP50 === null ? "—" : `${showP50}ms`} · p95{" "}
      {showP95 === null ? "—" : `${showP95}ms`}
    </div>
  );
}
