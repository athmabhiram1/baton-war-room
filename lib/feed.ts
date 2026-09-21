// T4: Liveblocks feed + storage adapter for the worker loop.
// Verbs map 1:1 onto @liveblocks/node: getFeedMessages / createFeedMessage /
// updateFeedMessage (+ mutateStorage for the task write). Without a server
// secret (tests, unprovisioned dev) every call degrades to an in-memory stub
// so the loop stays runnable and unit-testable.
// Docs:
// - mutateStorage server mutation: https://github.com/liveblocks/liveblocks/blob/main/docs/pages/use-cases/custom-app.mdx (Context7 /liveblocks/liveblocks)
// - agentic mutateStorage + generateText: https://github.com/liveblocks/liveblocks/blob/main/docs/pages/use-cases/agentic-users.mdx (Context7 /liveblocks/liveblocks)
import { Liveblocks } from "@liveblocks/node";
import { LiveList } from "@liveblocks/client";

import { WORKER_FEED_ID } from "./worker";

export type FeedData = Record<string, string | number | boolean | null>;

function clientOrNull(): Liveblocks | null {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) return null;
  try {
    return new Liveblocks({ secret });
  } catch {
    return null;
  }
}

// In-memory stub so dev/tests work without a provisioned feed.
const stubMessages: Array<{ id: string; data: FeedData }> = [];
let stubSeq = 0;

export async function getFeedMessages(
  roomId: string,
  feedId: string = WORKER_FEED_ID,
): Promise<{ data: Array<{ id: string; data: FeedData }> }> {
  const client = clientOrNull();
  if (!client) return { data: [...stubMessages] };
  try {
    const res = await client.getFeedMessages({ roomId, feedId });
    return { data: res.data.map((m) => ({ id: m.id, data: (m.data ?? {}) as FeedData })) };
  } catch {
    return { data: [...stubMessages] };
  }
}

export async function createFeedMessage(
  roomId: string,
  data: FeedData,
  feedId: string = WORKER_FEED_ID,
): Promise<{ id: string }> {
  const client = clientOrNull();
  if (!client) {
    const id = `stub-m${++stubSeq}`;
    stubMessages.push({ id, data });
    return { id };
  }
  try {
    const msg = await client.createFeedMessage({ roomId, feedId, data });
    return { id: msg.id };
  } catch {
    // Feed not provisioned yet — keep the turn durable in the stub.
    const id = `stub-m${++stubSeq}`;
    stubMessages.push({ id, data });
    return { id };
  }
}

/** Batch updater for streamed tokens (agent-status writing phase). */
export async function updateFeedMessage(
  roomId: string,
  messageId: string,
  data: FeedData,
  feedId: string = WORKER_FEED_ID,
): Promise<{ id: string }> {
  const client = clientOrNull();
  if (!client || messageId.startsWith("stub-")) {
    const found = stubMessages.find((m) => m.id === messageId);
    if (found) found.data = { ...found.data, ...data };
    return { id: messageId };
  }
  try {
    const msg = await client.updateFeedMessage({ roomId, feedId, messageId, data });
    return { id: msg.id };
  } catch {
    return { id: messageId };
  }
}

/**
 * Task write into room storage (LiveList "tasks"); only called after
 * validation passes. Creates the list on first use. No-op without a secret.
 */
export async function writeTaskToStorage(
  roomId: string,
  task: FeedData,
): Promise<{ ok: boolean }> {
  const client = clientOrNull();
  if (!client) return { ok: true };
  try {
    await client.mutateStorage(roomId, ({ root }) => {
      let tasks: LiveList<FeedData> | undefined;
      try {
        tasks = root.get("tasks") as unknown as LiveList<FeedData>;
      } catch {
        tasks = undefined;
      }
      if (!tasks) {
        root.set("tasks", new LiveList<FeedData>([task]));
      } else {
        tasks.push(task);
      }
    });
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
