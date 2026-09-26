"use client";

import { useCallback, useEffect, useState } from "react";

// Session hook (T8 front wiring, Wave 4): the server session is the source of
// truth. Every read goes through GET /api/me (cookie); nothing is stored in
// localStorage/sessionStorage and no identity is ever taken from the DOM.
export type SessionUser = {
  id: string;
  name: string | null;
  role: string | null;
};

function toSessionUser(input: unknown): SessionUser | null {
  if (typeof input !== "object" || input === null) return null;
  const rec = input as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id) return null;
  return {
    id: rec.id,
    name: typeof rec.name === "string" ? rec.name : null,
    role: typeof rec.role === "string" ? rec.role : null,
  };
}

export function useSessionUser(): {
  user: SessionUser | null;
  checked: boolean;
  refresh: () => Promise<SessionUser | null>;
} {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const body = (await res.json().catch(() => null)) as {
        user?: unknown;
      } | null;
      const next = toSessionUser(body?.user);
      setUser(next);
      return next;
    } catch {
      setUser(null);
      return null;
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, checked, refresh };
}
