# Product Requirements Document (PRD): Shift Handoff War-Room

## 1. Executive Summary
The **Shift Handoff War-Room** is a high-stakes collaborative workspace designed for on-call and support teams. It solves the critical problem of "context death" during shift transitions by providing a shared live session where humans and a persistent AI agent (RoomMate) collaborate. Built for a 36-hour hackathon, the system leverages **Liveblocks** for real-time CRDT-based collaboration and **Moss** for sub-10ms semantic memory and stateful agent handoffs.

## 2. Problem Statement
On-call teams lose operational context at every handover. Incoming engineers often face 150+ unread messages, spend 30–60 minutes reconstructing events, and frequently re-run failed hypotheses (tripling MTTR). Current tools track alert *state*, but not the *decision narrative*. Existing AI handoffs lack enforced acknowledgment, leading to "context resets" where the agent's history starts at zero.

## 3. Goals & Objectives
*   **Zero Context Loss:** Ensure the incoming engineer and successor agent resume with 100% of the previous shift's semantic context.
*   **Hard Governance:** Prevent room closure or critical actions without explicit human acknowledgment and 2-of-2 co-signing.
*   **High Performance:** Achieve <10ms local memory queries using Moss to maintain "Figma-speed" for AI interactions.
*   **Resilience:** Provide a "death-proof" logbook and a fixture mode for zero-downtime demos.

## 4. Target Users / Stakeholders
*   **Outgoing Engineer:** Owns the room, drives the agent, and initiates the handoff.
*   **Incoming Engineer:** Joins late, uses "Catch-me-up," and must explicitly ACK ownership.
*   **Support Lead:** Observes the narrative, participates in threads, and acts as a second signer for critical tasks.
*   **RoomMate AI Agent:** A persistent identity that survives crashes and handoffs via Moss checkpoints.

## 5. Functional Requirements

### 5.1 Real-Time Collaboration (Liveblocks Lane)
*   **Split Feeds:** 
    *   `war-feed`: Human/AI chat narrative.
    *   `agent-status`: High-frequency status updates (`thinking` → `searching` → `writing`).
*   **Presence:** Ephemeral cursor tracking and typing indicators with a 200ms throttle and 2s crash TTL.
*   **Shared Storage:** LiveObjects for `tasks` and `logbook` with optimistic UI updates.
*   **Threads:** Support for @AI review comments using `createThread`.

### 5.2 AI & Memory (Moss Lane)
*   **Query Path:** Synchronous `session.query` (1-10ms) using `moss-minilm` (384-dim). No network calls during the turn.
*   **Update Path:** Background `loadIndex` with `autoRefresh` (300s default / 30s fast-inventory). Polling pauses if un-pushed edits exist.
*   **Checkpointing:** `push_index()` replaces the same-name index without re-embedding, allowing successor agents to resume instantly.
*   **Validation Query:** A pre-proposal check against Moss to prevent stale or conflicted actions.

### 5.3 Governance & Durable Execution
*   **Handoff Gate:** Room enters `PENDING_HANDOFF` state. Closure returns `409 Conflict` until the incoming engineer provides an explicit ACK.
*   **Policy Gate (2-of-2 Co-sign):** Critical routes (`prod-push`, `resolve-P1`) require two distinct human signatures on the same `payloadHash` within a 10-minute window.
*   **Durable HITL:** `PENDING_HUMAN_APPROVAL` states are persisted in PostgreSQL. The worker yields the thread (zero CPU) and resumes via webhook/checkpoint.
*   **Single Writer Funnel:** Applies strictly to `pushIndex` and audit sequencing to prevent race conditions.

## 6. Non-Functional Requirements
*   **Performance:** Moss local query <50ms; Server response <500ms; AuthZ <200ms.
*   **Isolation:** Every query/storage arrow must carry a server-derived `[war-roomId]` badge.
*   **Security:** Row Level Security (RLS) in Postgres; no secrets in `NEXT_PUBLIC_*`.
*   **Cost Guard:** Solo build target $0; 10 connections/room; LLM top-3 truncation (500 chars/doc).

## 7. System Architecture Overview
The system is organized into five tripartite lanes:
1.  **Browser Clients:** Next.js 16 frontend.
2.  **Edge & Auth:** Liveblocks gateway and Next.js API auth.
3.  **Governance & Durable HITL:** Handoff/Policy gates and Postgres-backed state manager.
4.  **Agent Loop:** RoomMate worker using Gemini 2.5 Flash and split feeds.
5.  **Memory & Proof:** Moss memory layer and the Resilience Strip.

## 8. Tech Stack
*   **Framework:** Next.js 16 (App Router), TypeScript.
*   **Collaboration:** Liveblocks (`@liveblocks/react`, `@liveblocks/node`).
*   **AI Memory:** Moss (`@moss-js/moss` Server SDK).
*   **LLM:** Gemini 2.5 Flash via Vercel AI SDK (`generateText`).
*   **Database:** PostgreSQL (Audit/Durable State), Redis (Retry Queue).
*   **UI:** Tailwind CSS, shadcn/ui.

## 9. Data Requirements
*   **Liveblocks Storage:** `tasks: Record<taskId, Task>`, `logbook: Array<Entry>`.
*   **Moss Docs:** `{ text, metadata: { roomId, userId, kind, priority, ts } }`.
*   **Postgres Audit:** Append-only log of all `storageUpdated` events via webhooks.

## 10. API Specifications
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/liveblocks-auth` | POST | `prepareSession` → `allow("war-*")` → `authorize`. |
| `/api/moss-token` | GET | Mints short-lived Moss tokens for the client. |
| `/api/query` | POST | Returns semantic citations + `timeTakenInMs`. |
| `/api/handoff` | POST | Initiates/ACKs handoff; manages `PENDING_HANDOFF`. |
| `/api/catchup` | POST | Recalls high-priority decisions/findings from Moss. |
| `/api/metrics` | GET | Surfaces p50/p95 latency for the HUD. |

## 11. Security Requirements
*   **Isolation:** Red dashed cross-room read protection; `DENY` + `isolation_violation` audit.
*   **AuthZ:** ID-token validation + RLS `USING tenant_id = current_setting`.
*   **Secrets:** `LIVEBLOCKS_SECRET_KEY` and `MOSS_PROJECT_KEY` are server-only.

## 12. Deployment & Infrastructure
*   **Platform:** Vercel (Root: `ycomb`).
*   **Webhooks:** `verifyRequest` logic for Liveblocks → Postgres mirroring.
*   **Local Dev:** `localtunnel` or `ngrok` for webhook testing.

## 13. Success Metrics
*   **UX (35%):** Successful "Catch-me-up" and ACK gate flow in demo.
*   **Tech (30%):** Zero-loss agent resumption after simulated worker kill.
*   **Speed (20%):** Moss query latency consistently <10ms in HUD.
*   **Demo (15%):** Resilience strip successfully handles `?fixture=1` and `?offline`.

## 14. Timeline & Milestones (36h)
*   **0-4h:** Scaffold Next.js, Auth, and Liveblocks RoomProvider.
*   **4-12h:** Moss integration (Boot Warm, `loadIndex`, `session.query`).
*   **12-20h:** Agent Worker loop, Split Feeds, and Latency HUD.
*   **20-28h:** Handoff Gate, Policy Gate (Co-sign), and Durable HITL.
*   **28-32h:** Fixture mode, Offline replay, and UI polish.
*   **32-36h:** Vercel deployment, final testing, and video recording.

## 15. Open Questions & Risks
*   **Risk:** LLM context window limits during long incidents. *Mitigation:* Moss top-3 truncation and priority filtering.
*   **Risk:** Liveblocks free-tier connection caps. *Mitigation:* 10s inactive pause and 10-connection limit per room.
*   **Unresolved:** GDPR export requirements (Out of scope for hackathon).