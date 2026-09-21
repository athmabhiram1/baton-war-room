export default function PresenceAvatars({ users }: { users: string[] }) {
  return (
    <div aria-label="Presence">
      {users.map((u) => (
        <span key={u}>{u}</span>
      ))}
    </div>
  );
}
