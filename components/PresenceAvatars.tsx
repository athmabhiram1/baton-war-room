"use client";

import { useOthers, useSelf } from "@liveblocks/react/suspense";

declare global {
  interface Liveblocks {
    Presence: {
      typing: boolean;
      name?: string;
    };
  }
}

function initials(name: string): string {
  const parts = name.replace(/^user\s*/i, "").split(/[^a-z0-9]+/i).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Template avatar stack (.avatars > .av + .st) driven by Liveblocks
// presence: useOthers for the room, useSelf for the local user, with a
// typing indicator when any peer has typing=true.
export default function PresenceAvatars() {
  const others = useOthers();
  const self = useSelf();

  const typingCount = others.filter((o) => o.presence?.typing).length;
  const selfName = self?.info?.name ?? "You";

  return (
    <div className="avatars" aria-label="Presence">
      <div aria-label="Avatar stack" style={{ display: "contents" }}>
        {others.map(({ connectionId, info }) => {
          const name = info?.name ?? `User ${connectionId}`;
          return (
            <span className="av" key={connectionId} title={name}>
              {initials(name)}
              <span className="st" />
            </span>
          );
        })}
        {self && (
          <span className="av" title={selfName}>
            {initials(selfName)}
            <span className="st" />
          </span>
        )}
      </div>
      <span
        aria-label="Occupancy"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {others.length + (self ? 1 : 0)} online
      </span>
      {typingCount > 0 && (
        <span
          aria-label="Typing indicator"
          className="mono"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          {typingCount} typing…
        </span>
      )}
    </div>
  );
}
