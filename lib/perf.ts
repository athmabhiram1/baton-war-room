// 4 timers: presence.join / feed.publish / moss.query / handoff.ack.

export type PerfLabel = "presence.join" | "feed.publish" | "moss.query" | "handoff.ack";

const marks = new Map<PerfLabel, number>();

export function start(label: PerfLabel): void {
  marks.set(label, Date.now());
}

export function elapsedMs(label: PerfLabel): number {
  const t0 = marks.get(label);
  return t0 === undefined ? -1 : Date.now() - t0;
}
