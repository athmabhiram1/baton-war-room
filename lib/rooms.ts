// T4 rooms store (Wave 2, docs/BACKEND_PLAN.md). Join-by-code only: `ensure`
// creates on first join, `join` requires an existing code. Room id format
// stays war-<id> for RoomProvider + liveblocks-auth regex compatibility.
// The db client is imported lazily so this module loads without DATABASE_URL
// (unit tests mock the store fns and never touch the database).
export const ROOM_CODE_RE = /^war-[A-Za-z0-9_-]{1,64}$/;

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toLowerCase();
  return ROOM_CODE_RE.test(code) ? code : null;
}

export type RoomRow = { code: string; createdBy: string };

export async function getRoom(code: string): Promise<RoomRow | null> {
  const { db, rooms } = await import("./db");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ code: rooms.code, createdBy: rooms.createdBy })
    .from(rooms)
    .where(eq(rooms.code, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function createRoom(
  code: string,
  createdBy: string,
): Promise<RoomRow> {
  const { db, rooms } = await import("./db");
  const [row] = await db
    .insert(rooms)
    .values({ code, createdBy })
    .onConflictDoNothing()
    .returning({ code: rooms.code, createdBy: rooms.createdBy });
  if (row) return row;
  const existing = await getRoom(code);
  if (!existing) throw new Error("room create returned no row");
  return existing;
}

export async function upsertMember(
  code: string,
  userId: string,
  role: string,
): Promise<{ role: string }> {
  const { db, roomMembers } = await import("./db");
  const [row] = await db
    .insert(roomMembers)
    .values({ roomCode: code, userId, role })
    .onConflictDoUpdate({
      target: [roomMembers.roomCode, roomMembers.userId],
      set: { role },
    })
    .returning({ role: roomMembers.role });
  if (!row?.role) throw new Error("member upsert returned no row");
  return { role: row.role };
}
