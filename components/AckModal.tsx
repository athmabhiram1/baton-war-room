"use client";

export default function AckModal({ onAck }: { onAck: () => void }) {
  return (
    <dialog open>
      <p>Take explicit ownership of this room before it can close.</p>
      <button onClick={onAck} type="button">
        ACK
      </button>
    </dialog>
  );
}
