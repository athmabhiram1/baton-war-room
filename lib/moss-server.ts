// Server-only Moss client. Module-scope client + loadIndex-once + session(roomId).
// TODO(W2): wire the Moss server SDK after provisioning. Keys are server-only:
// MOSS_PROJECT_KEY must never carry a NEXT_PUBLIC_ prefix.

const projectId = process.env.MOSS_PROJECT_ID;
const projectKey = process.env.MOSS_PROJECT_KEY;
const indexName = process.env.MOSS_INDEX_NAME ?? "war-room-seed";

export function mossConfig(): { hasKey: boolean; indexName: string; projectId?: string } {
  return { hasKey: Boolean(projectKey), indexName, projectId };
}

export function session(_roomId: string): never {
  throw new Error("Moss session not wired (W2 owns memory provisioning)");
}
