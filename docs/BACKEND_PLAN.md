# Baton Backend Plan — Real Two-User Demo (Neon Auth)

Goal: turn the static two-window demo into a real two-user app — login →
join-by-code → named Liveblocks presence → session-bound approvals/handoff.
Theme/CSS byte-identical. No building starts until `NEON_AUTH_BASE_URL` is
in `.env` (Wave 0 blocker).

## Locked decisions

- **Auth: Neon Auth (Managed Better Auth).** Console toggle; users/sessions
  in `neon_auth.*` inside our own Postgres (branch-cloned, RLS-ready);
  free to 60k MAU. Beats self-hosted better-auth (no 4-table migration,
  no bundle bloat) and cookie-only demo login (shared jar = same user twice).
- **Login: name + role, no password.** Matches the template login modal
  (`#login-name` / `#login-role` / `#login-go` in
  `docs/reference/fix_front.html:1014-1040`).
- **Rooms: join-by-code only.** `ensure` auto-creates on first join; `join`
  requires existing. No lobby list, no invites, no codeless create.
- **Actors: server-bound.** `body.actor` ignored/rejected (403 +
  `actor_spoof` audit). Co-sign unchanged: distinct humans, same
  payloadHash, W=10min, fail-closed.
- **Approvals: wipe pre-prod rows**, enforce `actor_id NOT NULL →
  neon_auth.user.id`.
- Room codes canonical: `war-[A-Za-z0-9_-]{1,64}`.

## Endpoint map (final contracts)

```
POST /api/auth/login {name, role} → 200 {user:{id,name,role}} + cookie
POST /api/auth/logout             → 200 {ok:true} + cleared cookie
GET  /api/me                      → 200 {user:{id,name,role}} | 401
POST /api/rooms/ensure {code}     → 200 {room:{code}, member:{role}} | 400 | 401
POST /api/rooms/join {code}       → 200 {room, member} | 404 unknown | 401
POST /api/liveblocks-auth {room}  → 200 token body | 401 unauth | 403 cross-room
POST /api/approvals {roomId, action, payloadHash, step}
                                  → 201/200 | 403 (no actor field — server stamps it)
POST /api/handoff {roomId, action}→ 200 | 409 PENDING_HANDOFF | 403 (same)
```

Liveblocks binding: `prepareSession(session.user.id,
{userInfo:{name, role}})` + `allow(room, FULL_ACCESS)` after membership
check. `anon-*` path deleted. Presence/typing read `useSelf/useOthers`
directly — `resolveUsers` NOT needed (Comments only).

## Waves (~12h solo)

### Wave 0 — T1: Neon Auth foundation (0.5h)
Console → Project → Branch → Auth → Enable; copy Auth URL.
`lib/auth/server.ts` (`createNeonAuth` + cookie secret),
`app/api/auth/[...path]/route.ts` passthrough, env vars,
`drizzle-kit pull` to introspect `neon_auth` for FKs.
Verify: `getSession()` returns a user.

### Wave 1 — T2 session endpoints (2h) ‖ T3 gates (1h) [parallel]
- T2 (TDD `tests/auth-session.test.ts`): login/logout/me via
  `auth.getSession()`; no body-userId accepted anywhere.
  Verify: `curl -c jar POST /api/auth/login` → `curl -b jar /api/me` 200.
- T3 (TDD `tests/middleware-gate.test.ts`): `proxy.ts` cookie-presence
  check ONLY (no full session at edge); `room/[id]/page.tsx` full server
  check → unauth redirects `/`.
  Verify: `/room/war-demo` → 307 without cookie, 200 with.

### Wave 2 — T4 rooms (2h, TDD `tests/rooms.test.ts`)
Migration `drizzle/0003_rooms.sql`: `rooms(code PK, CHECK charset)` +
  `room_members(room_code FK, user_id FK, role, joined_at,
  PK(room_code,user_id))`. Implement `ensure` + `join`. Membership row
  must exist post-join; isolation holds across users.
  Verify: `curl -b jar POST /api/rooms/ensure '{"code":"war-demo01"}'` 200.

### Wave 3 — three bindings, parallel (5.5h, TDD)
- T5 approvals (deep): migration `0004_approvals_actor.sql`
  (`actor_id FK NOT NULL` + wipe backfill); route derives actor from
  session; spoof → 403 + audit; co-sign matrix stays green.
  Verify: body `actor:mallory` ignored (proposer=session user).
- T6 handoff (quick): same binding; 409→ACK→200 + funnel + reconciler
  untouched. Verify: `initiatedBy` = session user.
- T7 liveblocks-auth (quick): session + membership gates; delete anon
  path (`grep -c 'anon-'` → 0). Verify: no-cookie 401, non-member 403.

### Wave 4 — T8 front wiring (3h, visual-engineering)
Port `fix_front.html` slots to live contracts: login modal → session API,
join bar → `ensure` + `/room/<code>`, `[data-users]` / `[data-sign]` /
`[data-handoff]` / `[data-room="code"]` wired to session + presence.
ZERO `<style>` changes (empty CSS diff = acceptance).
Verify: `tests/e2e-auth.spec.ts` green (login → join → reload persists).

### Wave 5 — T9 ship gate (2h)
Full vitest + `scripts/eval.mjs` 6/6 + latency probe (p50≤800ms,
p95≤2000ms) + prod smoke curls into `docs/evidence/` + Momus accept per
wave. Never start a wave on red.

## Scenario contract (all must PASS with test + surface proof)

- **S1 happy:** login → join → query returns 200 + ≥2 citations.
- **S2 edge:** two windows, distinct identities; kill/resume; fixture/offline.
- **S3 regression:** spoof actor → 403 + audit; cross-room → 403 +
  `isolation_violation`; close-while-pending → 409; 1/2 execute → 403.

## Descope order (never cut: bindings, 409/200, DENY, metrics)

Avatar polish → PWA manifest → HUD polish → catchup richness → offline
replay → fixture beyond query.

## Key docs

- https://neon.com/docs/auth/overview
- https://neon.com/docs/auth/quick-start/nextjs-api-only
- https://neon.com/docs/auth/reference/nextjs-server
- https://neon.com/docs/auth/branching-authentication
- https://neon.com/docs/auth/production-checklist
- https://liveblocks.io/docs/authentication/access-token/nextjs
