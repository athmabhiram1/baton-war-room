// Canonical war-room session roles — mirrors the login modal options
// (#login-role in docs/reference/fix_front.html).
export const SESSION_ROLES = ["Primary on-call", "Comms lane", "Observer"] as const;

export type SessionRole = (typeof SESSION_ROLES)[number];

export function parseSessionRole(input: unknown): SessionRole | null {
  if (typeof input !== "string") return null;
  const t = input.trim().toLowerCase();
  return SESSION_ROLES.find((r) => r.toLowerCase() === t) ?? null;
}
