"use client";

// TODO(W1-provision): RoomProvider id={`war-${id}`} + ClientSideSuspense
// once @liveblocks/react is installed.
export default function Room({ id }: { id: string }) {
  return (
    <main>
      <h1>War room {id}</h1>
      <p>Liveblocks room id: war-{id}</p>
    </main>
  );
}
