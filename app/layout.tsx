import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  description: "One live war-room per incident: 2 humans + 1 agent, zero repeat questions.",
  title: "Baton — Shift Handoff War-Room",
};

// TODO(W1-provision): wrap children in the Liveblocks RoomProvider once
// @liveblocks/react is installed. Server-only keys stay out of NEXT_PUBLIC_*.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
