import { createHash } from "node:crypto";

// Co-sign: distinct humans, same payloadHash, W-window, fail-closed (plan §5).
export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function coSignWindowMs(): number {
  // Production W=10min. Tests override CO_SIGN_WINDOW_MS=60000 (plan §5/T5).
  return Number(process.env.CO_SIGN_WINDOW_MS ?? 600_000);
}
