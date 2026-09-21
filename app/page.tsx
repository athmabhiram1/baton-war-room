"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");

  function create() {
    router.push(`/room/${crypto.randomUUID()}`);
  }

  function join() {
    const id = roomId.trim();
    if (id.length > 0) router.push(`/room/${encodeURIComponent(id)}`);
  }

  return (
    <main>
      <h1>Baton — Shift Handoff War-Room</h1>
      <p>One live war-room per incident. Create a room or join with an id.</p>
      <div>
        <input
          aria-label="Room id"
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="room id"
          value={roomId}
        />
        <button onClick={join} type="button">
          Join room
        </button>
        <button onClick={create} type="button">
          Create room
        </button>
      </div>
    </main>
  );
}
