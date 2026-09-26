"use client";

import { Component, type ReactNode } from "react";
import { ClientSideSuspense, useOthers, useSelf } from "@liveblocks/react/suspense";

// T8 room roster (Wave 4): [data-users="roster"] driven by the server session
// (me) + Liveblocks presence (others) — no hardcoded identity literals.
// Suspended reads sit behind ClientSideSuspense + an error boundary so the
// shell stays up when Liveblocks is unreachable.

class RosterBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Presence is best-effort; the session row still renders.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function initials(name: string): string {
  const parts = name.replace(/^user\s*/i, "").split(/[^a-z0-9]+/i).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function PersonRow({
  name,
  sub,
  badge,
}: {
  name: string;
  sub: string;
  badge: string;
}) {
  return (
    <div className="person">
      <span className="av">
        {initials(name)}
        <span className="st" />
      </span>
      <div>
        <div className="pn">{name}</div>
        <div className="pr">{sub}</div>
      </div>
      <span className="ps">{badge}</span>
    </div>
  );
}

function RosterInner({ meName, meRole }: { meName: string | null; meRole: string | null }) {
  const others = useOthers();
  const self = useSelf();
  const selfName = self?.info?.name ?? meName ?? "—";
  return (
    <>
      <PersonRow name={selfName} sub={`${meRole ?? "—"} · you`} badge="OWNER" />
      {others.map(({ connectionId, info }) => {
        const peer = info?.name ?? `User ${connectionId}`;
        return <PersonRow key={connectionId} name={peer} sub="In this room" badge="ONLINE" />;
      })}
    </>
  );
}

export default function RosterLive({
  meName,
  meRole,
}: {
  meName: string | null;
  meRole: string | null;
}) {
  const fallback = <PersonRow name={meName ?? "—"} sub={`${meRole ?? "—"} · you`} badge="OWNER" />;
  return (
    <div data-users="roster" style={{ display: "contents" }}>
      <RosterBoundary fallback={fallback}>
        <ClientSideSuspense fallback={fallback}>
          <RosterInner meName={meName} meRole={meRole} />
        </ClientSideSuspense>
      </RosterBoundary>
    </div>
  );
}

function PeerInner({ fallback }: { fallback: string }) {
  const others = useOthers();
  const peer = others.length > 0 ? (others[0].info?.name ?? null) : null;
  return <>{peer ?? fallback}</>;
}

// First other presence in the room — the co-sign peer / handoff successor
// candidate. Falls back to "—", never a hardcoded name.
export function PeerName({ fallback = "—" }: { fallback?: string }) {
  return (
    <RosterBoundary fallback={<>{fallback}</>}>
      <ClientSideSuspense fallback={<>{fallback}</>}>
        <PeerInner fallback={fallback} />
      </ClientSideSuspense>
    </RosterBoundary>
  );
}

function PeerRoleInner({ fallback }: { fallback: string }) {
  const others = useOthers();
  const info = others.length > 0 ? (others[0].info as { role?: unknown } | undefined) : undefined;
  const role = info?.role;
  return <>{typeof role === "string" && role ? role : fallback}</>;
}

export function PeerRole({ fallback = "—" }: { fallback?: string }) {
  return (
    <RosterBoundary fallback={<>{fallback}</>}>
      <ClientSideSuspense fallback={<>{fallback}</>}>
        <PeerRoleInner fallback={fallback} />
      </ClientSideSuspense>
    </RosterBoundary>
  );
}
