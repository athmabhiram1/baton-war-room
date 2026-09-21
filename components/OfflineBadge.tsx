"use client";

import { useEffect, useState } from "react";

function readFixture(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("fixture") === "1";
}

function readOfflineFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("offline");
}

// ?fixture=1 → FIXTURE (canned docs, zero Moss calls).
// navigator.onLine === false, ?offline present, or a lost-connection
// (offline event) → OFFLINE. Otherwise renders nothing.
export default function OfflineBadge() {
  // window (not navigator) is the SSR guard: Node 21+ ships a partial
  // navigator where onLine may be undefined, which would render OFFLINE on
  // the server and mismatch hydration. Server always starts online.
  const [online, setOnline] = useState<boolean>(() =>
    typeof window === "undefined" ? true : navigator.onLine,
  );
  const [fixture, setFixture] = useState<boolean>(false);
  const [forcedOffline, setForcedOffline] = useState<boolean>(false);

  useEffect(() => {
    setFixture(readFixture());
    setForcedOffline(readOfflineFlag());
    const goOffline = () => setOnline(false);
    const goOnline = () => setOnline(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (fixture) {
    return (
      <span
        role="status"
        aria-label="Fixture mode"
        className="mono"
        style={{
          border: "1px solid color-mix(in srgb, var(--warn) 45%, transparent)",
          borderRadius: 3,
          color: "var(--warn)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".08em",
          padding: "2px 7px",
        }}
      >
        FIXTURE
      </span>
    );
  }

  if (!online || forcedOffline) {
    return (
      <span role="status" aria-label="Offline" className="sev">
        OFFLINE
      </span>
    );
  }

  return null;
}
