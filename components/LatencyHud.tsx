export type HudMode = "LIVE" | "FIXTURE" | "OFFLINE";

export default function LatencyHud({
  lastMs,
  mode,
  p50,
  p95,
}: {
  lastMs: number;
  mode: HudMode;
  p50: number;
  p95: number;
}) {
  return (
    <div role="status">
      {mode} · {lastMs}ms · p50 {p50}ms · p95 {p95}ms
    </div>
  );
}
