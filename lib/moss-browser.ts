"use client";

// Lazy client-only Moss singleton (only if browser search is needed).
let client: unknown = null;

export function getBrowserClient(): never {
  if (client !== null) throw new Error("unreachable");
  throw new Error("Moss browser client not wired (only if browser search is needed)");
}
