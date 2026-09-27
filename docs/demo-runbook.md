# BATON — 4–5 MINUTE SOLO PRESENTATION SCRIPT

Solo presenter. Keep it simple enough to speak naturally while sounding technical and professional.

---

### 1. Introduction

“Good morning everyone.

We are presenting **Baton — a Shift Handoff War-Room for AI-assisted incident response.**

The problem is simple.

During a production incident, an engineer and an AI agent may already have investigated the problem, collected evidence, and made decisions. But when the engineer or agent is replaced, the next person often has to start again and reconstruct what happened.

**Baton solves this by keeping the incident context in one shared room.**

Two humans and an AI agent can work together, the AI can be replaced without losing context, and critical actions require human approval.”

---

### 2. Show the room

[Open Baton]

“Here is our incident war-room.

I’m the primary engineer, and another user can join the same room from a separate session.

Both users can see the same room state and real-time activity.

So this is not just a chatbot. It is a collaborative operational workspace.”

---

### 3. Ask the AI

“I’ll start with a simple incident question:

**‘What happened so far?’**”

[Run query]

“Baton retrieves relevant operational knowledge using **Moss** and gives us an answer with citations.

These citations are important because I can inspect the actual source behind the answer.”

[Open citation]

“So during an incident, the engineer is not only seeing an AI response, but also the evidence used to support it.”

---

### 4. Human controls the investigation

“Now I can change the direction of the investigation.

For example:

**‘Actually, check replica lag first.’**”

[Type/send]

“The AI can adapt to the new direction while the room keeps the shared context.

So humans remain in control of the investigation.”

---

### 5. Kill the agent

“Now let’s test the main problem Baton is designed to solve.

I’ll simulate an agent failure.”

[Kill agent]

“The important question is:

**Do we start again?**

No.

Another user can acknowledge the handoff, and Baton resumes from the stored checkpoint.”

[ACK / resume]

“This means the successor continues from the existing state instead of repeating the investigation.”

### Say this slowly:

**‘The successor continues from the checkpoint, not from zero.’**

---

### 6. Two-person approval

“Now let's say the AI recommends a risky failover action.

I can propose the action, but I cannot execute it alone.”

[Show 1/2]

“The system requires a second human to approve the same action.”

[Switch to second session / demonstrate ratification]

“After the second approval, we reach **2 of 2**, and execution is allowed.”

### Say:

**‘One human proposes. Another human ratifies.’**

---

### 7. Close protection

“Finally, Baton also protects the end of the incident.

If I try to close the room before the handoff is acknowledged…”

[Click Close]

“…the system rejects it.”

[Show 409]

“After the handoff is acknowledged…”

[ACK → Close]

“…the incident can be closed.”

### Say:

**‘No ACK, no close.’**

---

### 8. Technical architecture

“Technically, Baton uses:

**Next.js** for the application,

**Liveblocks** for real-time collaboration and presence,

**Moss** for low-latency semantic retrieval,

**Gemini Flash-Lite** for AI generation,

and **Neon Postgres** for durable approvals, handoffs, and audit state.

The key architectural idea is simple:

**real-time collaboration is handled separately from durable operational state.**

That is what allows the system to survive an agent failure or a human handoff.”

---

### 9. Closing

“So Baton is not trying to be another AI chatbot.

It is a **coordination and control layer for AI-assisted incident response.**

The core idea is:

**When the people or agents change, the operational context should not disappear.**

That is Baton.

Thank you.”

---

## Memorize only this flow

Before going on stage, remember:

**Problem → Shared Room → Ask AI → Citations → Human Redirect → Kill Agent → Resume Checkpoint → 2-of-2 Approval → ACK → Close.**

And memorize these four lines:

> **“The room is the state.”**
> **“The successor continues from the checkpoint, not from zero.”**
> **“One human proposes. Another human ratifies.”**
> **“No ACK, no close.”**

These give you a clear backbone even if you forget some wording. The repository README and `docs/` describe these same query, handoff, co-sign, and close contracts; Liveblocks rooms/presence concepts are covered in the official concepts guide. ([liveblocks.io][1])

[1]: https://liveblocks.io/docs/concepts "Concepts · Liveblocks Docs"
