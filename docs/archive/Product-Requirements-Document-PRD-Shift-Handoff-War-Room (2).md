# Product Requirements Document (PRD): Shift Handoff War-Room

## 1. Executive Summary
The **Shift Handoff War-Room** is a high-stakes collaborative workspace designed for on-call and support teams. It leverages Multiplayer AI to solve the "context death" that occurs during shift transitions. By combining real-time CRDT-based collaboration (Liveblocks) with persistent, fast semantic memory (Moss), the system ensures that incoming engineers can resume incidents with zero repeat questions and enforced ownership.

## 2. Problem Statement
On-call shifts lose operational context at every transition. Engineers often face 150+ unread messages, spend 30–60 minutes reconstructing events, and frequently re-run failed hypotheses (tripling MTTR). Current tools track alert *state* but fail to capture the *decision narrative*. AI-to-human handoffs today lack enforced read-back or acknowledged ownership, leading to "context resets."

## 3. Goals & Objectives
*   **Zero Context Loss:** Provide a single, live agent session that survives engineer rotations.
*   **High-Speed Recall:** Enable <10ms semantic retrieval of incident history via Moss.
*   **Enforced Governance:** Eliminate "unacknowledged handoffs" via hard gates and 2-of-2 human co-signing.
*   **Resilient Demo:** Ensure a 100% successful 36-hour hackathon delivery with "Fixture Mode" for offline reliability.

## 4. Target Users / Stakeholders
*   **Outgoing Engineer:** Owns the room, drives the agent, and initiates the structured handoff.
*   **Incoming Engineer:** Joins late, uses "Catch-me-up," and must explicitly ACK ownership.
*   **Support Lead/Observer:** Monitors the room and provides the second signature for critical tasks.
*   **AI Agent (RoomMate):** A persistent identity (id=ai-agent) that maintains context across shifts.

## 5. Functional Requirements

### 5.1 Real-Time Collaboration
*   **Multi-Feed Chat:** 
    *   `war-feed`: Primary incident narrative.
    *   `agent-status`: High-frequency status updates (thinking → searching → writing).
*   **Presence:** Real-time cursor tracking and typing indicators with a 200ms throttle and 2s TTL for agent crash detection.
*   **Shared Storage:** LiveObjects for `tasks` and `logbook` that persist until room deletion.

### 5.2 AI & Memory (Moss)
*   **Query Path:** Synchronous 1-10ms in-process queries using `@moss-js/moss`. Filters must include `roomId`, `kind` (decision/todo/finding), and `priority`.
*   **Update Path:** Background `loadIndex` with `autoRefresh` (30s for runbooks) and atomic hot-swaps.
*   **Handoff Persistence:** `push_index()` creates a same-name checkpoint for successor agents to resume without re-embedding.

### 5.3 Governance & Durable Execution
*   **Handoff Gate:** 
    *   Room enters `PENDING_HANDOFF` state on initiation.
    *   Incoming engineer must provide an explicit ACK.
    *   Closing the room without ACK returns a `409 Conflict`; ACK returns `200 OK`.
    *   Escalation: 5min (P1) / 15min (P2) timeouts trigger manager pages via Retry Queue.
*   **Policy Gate (2-of-2 Co-sign):** 
    *   Critical actions (e.g., prod-push, resolve-P1) require a proposer and a distinct human ratifier.
    *   Signatures must match the `payloadHash` within a 10-minute window.
*   **Single Writer Funnel:** All writes are sequenced by a per-room `seq` value to prevent race conditions.

## 6. Non-Functional Requirements
*   **Performance:** Moss local queries <10ms; AuthZ p95 <200ms; Server responses <500ms.
*   **Reliability:** Durable outbox for retries (max 3, 2^n backoff). 3x failures result in an `[ESCALATED]` blocked task.
*   **Cost Efficiency:** Solo build target $0. Use Moss free tier (3-index) and LLM top-3 truncation (500 chars/doc).
*   **Resilience:** `?fixture=1` mode for canned data; `?offline` mode for connection replay.

## 7. System Architecture Overview
The system is divided into five functional lanes:
1.  **Browser Clients:** Next.js 16 frontend with Liveblocks React.
2.  **Edge & Auth:** Vercel-hosted API routes for token minting and room authorization.
3.  **Governance Gates:** Logic layer for handoffs, co-signing, and write sequencing.
4.  **Agent Loop:** RoomMate worker managing the LLM (Gemini 2.5 Flash) and Moss interactions.
5.  **Memory & Proof:** Moss memory layer, Postgres audit DB, and the Resilience Strip.

## 8. Tech Stack
*   **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui.
*   **Collaboration:** Liveblocks (@liveblocks/react, @liveblocks/node).
*   **AI/LLM:** Gemini 2.5 Flash via Vercel AI SDK (`generateText`).
*   **Memory:** @moss-js/moss (Server SDK), MiniLM-L6-v2 embeddings.
*   **Database:** PostgreSQL (Audit/Outbox), Redis (Queueing).
*   **Deployment:** Vercel (Root: ycomb).

## 9. Data Requirements
*   **Liveblocks Storage:** `tasks: Record<taskId, TaskObject>`, `logbook: Array<Entry>`.
*   **Moss Document Metadata:** `{roomId, userId, kind: 'decision'|'todo'|'finding', priority, ts}`.
*   **Postgres Audit:** Append-only log of all `storageUpdated` events via webhooks.

## 10. API Specifications
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/liveblocks-auth` | POST | Mints session tokens with `war-<uuid>` scope. |
| `/api/moss-token` | GET | Returns short-lived Moss access tokens. |
| `/api/query` | POST | Returns semantic citations + `timeTakenInMs`. |
| `/api/handoff` | POST | Initiates/ACKs handoff; manages `PENDING_HANDOFF` state. |
| `/api/catchup` | POST | Moss recall for high-priority decisions/findings. |
| `/api/metrics` | GET | Returns p50/p95 latency for presence, feed, and Moss. |

## 11. Security Requirements
*   **Isolation:** Every Moss query and Liveblocks mutation must use a server-derived `war-roomId`.
*   **Data Protection:** Postgres RLS (`USING tenant_id`) and composite indexes.
*   **Secrets:** No `MOSS_PROJECT_KEY` or `GOOGLE_API_KEY` in `NEXT_PUBLIC_*`.
*   **Audit:** Red-dashed cross-room read attempts trigger an `isolation_violation` audit.

## 12. Deployment & Infrastructure
*   **Platform:** Vercel.
*   **Environment Variables:** `LIVEBLOCKS_SECRET_KEY`, `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.
*   **Local Testing:** `localtunnel` or `ngrok` for testing Liveblocks webhooks locally.

## 13. Success Metrics
*   **Latency:** Moss query p95 < 50ms.
*   **Governance:** 100% of critical tasks signed by 2 humans.
*   **Reliability:** 0% context loss during simulated agent crash/successor resume.

## 14. Timeline & Milestones (36h)
*   **0-4h:** Scaffold Next.js, Auth, and Liveblocks basic feeds.
*   **4-12h:** Moss Memory integration (loadIndex/query loop).
*   **12-20h:** RoomMate Worker implementation + Latency HUD.
*   **20-28h:** Handoff Gate & Policy Gate (2-of-2) logic.
*   **28-32h:** Fixture mode, offline replay, and UI polish.
*   **32-36h:** Deployment, final testing, and demo video.

## 15. Open Questions & Risks
*   **LLM Rate Limits:** Gemini 2.5 Flash limits on free tier during heavy demo usage.
*   **Liveblocks Caps:** 3,000 collaborative minutes on free tier; mitigated by 10s inactivity pause.
*   **Cold Starts:** Mitigated by "Boot Warm" `loadIndex` at module scope.