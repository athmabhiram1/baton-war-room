import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "One live war-room per incident: 2 humans + 1 agent, zero repeat questions.",
  title: "Baton — Shift Handoff War-Room",
};

// Theme is applied before paint so the server-rendered hero never flashes.
// No secrets here: fonts + theme only; LIVEBLOCKS_SECRET_KEY stays server-side.
const THEME_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem('bt-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Script id="bt-theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
