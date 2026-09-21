export default function OfflineBadge() {
  // Shown when ?offline: badge + idb/outbox replay (T6 owns).
  return <span role="status">OFFLINE</span>;
}
