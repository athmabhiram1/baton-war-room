# Product Requirements Document (PRD): Shift Handoff War-Room

## 1. Executive Summary
The **Shift Handoff War-Room** is a high-stakes collaborative workspace designed for Track 2 of the Multiplayer AI and Collaborative Agents hackathon. It addresses the critical failure point in on-call and support operations: context loss during shift transitions. By integrating **Liveblocks** for real-time multiplayer state and **Moss** for persistent semantic memory, the system provides a "Figma-for-agents" experience where incoming engineers inherit a live, "warm" agent session rather than a dead transcript.

## 2. Problem Statement
On-call support shifts lose context at every transition.
*   **The "Arvo Gap":** Incoming engineers face 150+ unread messages and 30–60 minutes of re-discovery.
*   **Inefficiency:** 83% of AI-to-human interactions involve repeat questions because agent context resets to zero.
*   **MTTR Inflation:** Late joiners often re-run killed hypotheses, tripling the Mean Time To Resolution (MTTR).

## 3. Goals & Objectives
*   **Zero Context Loss:** Enable incoming engineers to "catch up" instantly via semantic retrieval of decisions and findings.
*   **Durable Agency:** Ensure the AI agent (RoomMate) maintains state across crashes and handoffs.
*   **Hardened Governance:** Prevent unauthorized or unverified actions through multi-human co-signing and explicit handoff gates.
*   **High Performance:** Achieve <10ms local memory queries and <50ms UI updates.

## 4. Target Users / Stakeholders
*   **Outgoing Engineer:** Owns the room, drives the agent, and initiates the handoff.
*   **Incoming Engineer:** Joins late, uses "Catch-me-up," and must explicitly acknowledge ownership.
*   **Support Lead/Observer:** Monitors the room, provides threads, and co-signs critical actions.
*   **AI Agent (RoomMate):** A collaborative participant that maintains the logbook and executes tasks.

## 5. Functional Requirements

### 5.1 Collaborative Workspace (Liveblocks Lane)
*   **Presence:** Real-time cursors, typing indicators, and status with a 200ms throttle and 2s crash TTL.
*   **Split Feeds:** 
    *   `war-feed`: Primary chat narrative for humans and agents.
    *   `agent-status`: High-frequency feed showing agent state (`thinking` → `searching` → `writing` → `complete`).
*   **Storage:** LiveObjects for `tasks` and `logbook` (persisted until room deletion).

### 5.2 Memory & Context (Moss Lane)
*   **Query Path:** Synchronous per-turn retrieval using `session.query` (1-10ms in-process).
*   **Update Path:** Background `loadIndex` with `autoRefresh`.
    *   **Intervals:** Default 300s; 30s for fast-inventory indexes.
    *   **Logic:** Atomic hot-swap for in-flight queries; polling pauses if un-pushed local edits exist.
*   **Checkpointing:** `push_index()` replaces same-name indexes without re-embedding (pinned `moss-minilm`).
*   **Validation Query:** Before every proposal/task write, the worker runs a filtered Moss validation query (`roomId`, `kind`, `priority`); stale, conflicted, or cross-room context blocks the proposal and logs an `isolation_violation`.

### 5.3 Governance & Durable Execution
*   **Handoff Gate:** 
    *   POST `/api/handoff` triggers `PENDING_HANDOFF` state.
    *   Room closure returns `409 Conflict` until the incoming engineer hits the explicit ACK button.
    *   Escalation: 5min (P1) / 15min (P2) timeout triggers a retry and pages the secondary/lead.
*   **Policy Gate (2-of-2 Co-sign):** 
    *   Critical routes (`close-P1`, `prod-push`, `resolve-P1`, `export`) require a proposer and a distinct human ratifier.
    *   Signatures must match the `payloadHash` within a **10-minute window**.
    *   Stale or invalid attempts fail-closed and create an `[ESCALATED]` task.
*   **Single Writer Funnel:** Scoped strictly to `moss.pushIndex` and audit sequencing. Uses per-room `seq` to prevent race conditions.
*   **Durable HITL:** `PENDING_HUMAN_APPROVAL` is stored as a Postgres row `(status, updated_at)` with a reconciler cron every 5min re-firing webhooks for rows stuck PENDING past timeout (lost-webhook safety). The worker yields (zero CPU) and resumes from a Moss checkpoint via approval webhook; a 5s poll fallback covers webhook outage. Never an open transaction or blocked thread.
*   **Retry Queue:** Postgres `outbox` table (`SKIP LOCKED` drain + `NOTIFY` id-only wake + 5s poll fallback; payloads never in NOTIFY, re-SELECT the row) with **max=3 attempts** and **2^n backoff**. 3x no-ACK results in exactly one **`[ESCALATED]`** task (status=blocked) and a manager page; auto-retry freezes for manual intervention. Audit log is append-only; the agent cannot overwrite.

## 6. Non-Functional Requirements
*   **Performance:** Moss local query p95 < 50ms; AuthZ latency p95 < 200ms; Presence join p95 < 500ms.
*   **Security:** Server-derived `war-roomId` on every query/storage arrow. Postgres RLS using `tenant_id`. Red-dashed cross-room read protection (DENY + isolation_violation audit).
*   **Resilience:** 
    *   **Fixture Switch:** `?fixture=1` bypasses LLM/Moss for canned data ($0 cost demo).
    *   **Offline Replay:** Handles `room.disconnect` with an OFFLINE badge and re-sync.
*   **Cost Guard:** Solo build targets $0 across the stack —
    *   L1 Liveblocks Free (hard caps, pauses not overage): 1 demo room, solo-rehearse (solo sessions cost $0), ≤10 conns/room, ≤200 comments, ≤3M storage updates, ≤1 GB stored, ≤512 MB files, branding stays on, never share one `userId` across users.
    *   M1 Moss Developer-free: ≤3 indexes (ship 1), ≤500 MB stored, ≤50 MB ingest/mo, ≤10 GB egress/mo; local queries unlimited/never metered — preload at boot, freeze refresh during judging.
    *   G1 Gemini: Flash-Lite default, Flash max; hard caps ≤6k in-prompt / ≤1k out / thinking ≤2k / 1 req per 6s (10 RPM); free-tier RPD 250/day is binding — budget ~200 calls/day, queue + backoff on 429, Flash-Lite fallback (1000 RPD); no Grounding during demo.
    *   G2 Truncation fn: `keep_docs = floor((200k − system_prompt − 6k reserve) / 350)` at ~300-token chunks; drop lowest-score extras; never truncate mid-chunk; cache system prompt. Worst-case paid call ≈ (in/1M × $0.30) + (out/1M × $2.50).

## 7. System Architecture Overview
The system is divided into five tripartite lanes:
1.  **Browser Clients:** Next.js 16 frontend.
2.  **Edge & Auth:** Next.js API routes and Liveblocks Edge Gateway.
3.  **Governance Gates:** Handoff, Policy, and Single-Writer logic.
4.  **Agent Loop:** RoomMate worker, LLM integration, and Durable HITL manager.
5.  **Memory & Persistence:** Moss (In-process), Postgres (Audit/ACID), and Resilience Strip.

## 8. Tech Stack
*   **Frontend:** Next.js 16 (App Router), Tailwind CSS, shadcn/ui.
*   **Collaboration:** Liveblocks (`@liveblocks/react`, `@liveblocks/node`).
*   **AI/Memory:** Moss (`@moss-js/moss`), Gemini 2.5 Flash (via Vercel AI SDK).
*   **Database:** PostgreSQL (Audit/Durable State + transactional outbox).
*   **Deployment:** Vercel.

## 9. Data Requirements
*   **Moss Document:** `{ text, metadata: { roomId, userId, kind, priority, ts } }`.
*   **Liveblocks Storage:** `tasks` (LiveObject), `logbook` (LiveList).
*   **Postgres Audit:** Append-only log of all `storageUpdated` events via webhooks.

## 10. API Specifications
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/liveblocks-auth` | POST | Prepares session and allows `war-<uuid>` access. |
| `/api/moss-token` | GET | Mints short-lived Moss tokens. |
| `/api/query` | POST | Returns semantic context with citations and `timeTakenInMs`. |
| `/api/handoff` | POST | Initiates or ACKs a shift transition. |
| `/api/catchup` | POST | Filters Moss for high-priority decisions/findings. |
| `/api/metrics` | GET | Returns p50/p95 latency and doc counts. |

## 11. Security Requirements
*   **Authentication:** Next.js Auth handling `prepareSession`.
*   **Authorization:** Liveblocks `session.allow` namespaced to `war-<uuid>`.
*   **Data Protection:** No secrets in `NEXT_PUBLIC_*`. All Moss queries carry a mandatory `roomId` filter.

## 12. Deployment & Infrastructure
*   **Cloud:** Vercel (Root ycomb) — Fluid Node.js (not Edge) in 1 region co-located with Postgres; lean-memory functions (512 MB–1 GB); static cached on CDN (cached hit = edge request only); boot-warm `loadIndex` at module scope; tripwire at 70% Fast Data Transfer.
*   **Webhooks:** `WebhookHandler.verifyRequest` for durable Postgres mirroring (`storageUpdated` → `getStorageDocument(roomId,"json")`); reconciler cron covers lost deliveries.
*   **Local Dev:** `localtunnel`/`ngrok` for testing webhook-driven durable execution.

## 13. Success Metrics (Rubric Mapping)
*   **UX (35%):** Successful "Catch-me-up" recall and ACK gate enforcement.
*   **Technical (30%):** Proof of 2-of-2 co-sign, single-writer sequencing, and validation query blocking.
*   **Speed (20%):** Latency HUD showing <10ms Moss queries and <200ms AuthZ.
*   **Demo (15%):** Zero-loss resumption after killing the agent worker.

## 14. Timeline & Milestones (36h Sprint)
*   **0-4h:** Scaffold Next.js, Auth, and Liveblocks Feeds.
*   **4-12h:** Moss integration (loadIndex, query loop).
*   **12-20h:** Agent Worker logic and Latency HUD.
*   **20-28h:** Handoff Gate and Policy Co-sign implementation.
*   **28-32h:** Fixture mode and UI polish.
*   **32-36h:** Deployment, testing, and video submission.

## 15. Open Questions & Risks
*   **Risk:** LLM rate limits. *Mitigation:* `agent-status` feed decoupled from generation; G1 caps + G2 truncation; `DISABLE_LLM=1` extractive fallback kills all generation spend instantly.
*   **Risk:** Moss index growth. *Mitigation:* 500MB cap and top-3 document truncation.
*   **Risk:** Network failure during demo. *Mitigation:* `?fixture=1` mode.