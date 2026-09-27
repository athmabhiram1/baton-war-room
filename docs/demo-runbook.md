# BATON — GRAND FINALE JURY PRESENTATION

### 6–7 minute live presentation | 2 presenters

Jury: Deepak Chawla, Sanjay Jha, Rakhi Sharma, Shampesh Chakrabarty — backgrounds spanning startup/jury experience, AI/community, principal AI engineering, and sales/revenue. Cover problem clarity, technical depth, real-world usefulness, and why this becomes a product. Never lead with tech stack; lead with why Baton needs to exist.

---

## 1. Opening — Arun

**Arun:**

“Good morning, everyone.

Let me start with a situation that happens during almost every serious production incident.

An engineer and an AI agent are investigating a problem.

They have already gathered evidence, checked runbooks, made decisions, and reached a certain point in the investigation.

Then something happens.

The engineer disconnects.

The AI agent crashes.

Or another engineer has to take over.

Now the new person has the worst possible question to answer:

**‘What has already happened?’**

And usually, the answer is scattered across chat, logs, terminals, tickets, and conversation history.

That is the problem we decided to solve.

We built **Baton — a shift-handoff war-room for AI-assisted incident response.**

Baton gives two humans and an AI agent one shared operational context.

So when the people or agents change, **the context doesn't disappear.**”

---

## 2. What makes Baton different — Arun

“Baton is built around three guarantees.

**First: shared context.**

Two independent humans can participate in the same live incident room.

**Second: durable handoff.**

If an AI agent is killed or replaced, the successor continues from the stored checkpoint instead of starting the investigation again.

**Third: controlled execution.**

For risky actions, one human cannot simply press execute.

A second human must ratify the same action.

And the room cannot be closed until the handoff is acknowledged.

So our philosophy is very simple:

**The room is the state.**”

---

# 3. Live Demo — Arun + Priya

### Step 1 — Two humans join

**Arun:**

“I'll start as the primary on-call engineer.”

[Arun opens Baton.]

“Priya is joining separately as the secondary.”

[Priya joins from Browser B.]

**Arun:**

“Notice that we're not screen-sharing one session.

These are two independent user sessions inside the same incident room.”

[Show both rosters.]

“I can see Priya online…”

**Priya:**

“…and I can see Arun from my own session.”

**Arun:**

“That matters because Baton is designed for actual handoffs between people, not a simulated collaboration experience.”

---

# 4. AI investigation — Arun

**Arun:**

“Let's assume this is a SEV1 production incident.

I'll ask:

**‘What happened so far?’**”

[Enter query.]

“Baton retrieves the relevant operational knowledge and generates an answer with citations.”

[Point at citations.]

“Here we can see the supporting SOP references, relevance scores, and response timing.”

[Open citation.]

“And we can inspect the underlying source directly.”

---

## 5. Explain the AI architecture — Arun

“What is happening underneath is straightforward.

The incident room talks to our query API.

The query API uses **Moss** for semantic retrieval against our `war-room-seed` knowledge index.

Our demo knowledge base contains the operational SOPs.

The retrieved context is then passed to the generation layer.

This gives us something important during an incident:

**an AI answer that is not detached from the operational knowledge it is using.**”

---

# 6. Human steers the AI — Priya

**Priya:**

“Now I'll change the direction of the investigation.

Instead of following Arun's current line of investigation, I'll say:

**‘Actually, check replica lag first.’**”

[Priya types.]

**Priya:**

“Arun sees my activity immediately.”

[Show Browser A.]

**Arun:**

“So the AI is not operating as an isolated chatbot.

The humans are continuously steering the investigation while the room maintains the shared state.”

---

# 7. The critical moment — agent failure

**Arun:**

“Now let's create the failure scenario Baton was specifically designed for.

I'm going to kill the active agent.”

[Simulate agent kill.]

“The important question is:

What happens now?”

---

### Priya takes over

**Priya:**

“I'll acknowledge the handoff.”

[Click ACK.]

“Baton now resumes from the stored checkpoint.”

[Show checkpoint/replay.]

**Priya:**

“The successor doesn't have to repeat the investigation.

It receives the state that was already established.”

**Arun:**

“So we aren't handing over a giant transcript and asking someone to figure it out.

We're handing over **operational state**.”

---

# 8. Explain the key technical innovation — Arun

“This is where Baton is different from a normal chat-based workflow.

We persist the handoff state so that the next agent can resume from a known checkpoint.

The room keeps the collaborative state.

The backend keeps the durable workflow state.

That means the system is designed around **continuity**, not just conversation.”

---

# 9. High-risk action — two-person approval

**Arun:**

“Now let's move from investigation to action.

Suppose the AI recommends a risky failover.

I can propose it…”

[Open approval panel.]

“…but I cannot execute it alone.”

[Show `1/2`.]

“Right now, this action has one approval.”

---

### Priya

**Priya:**

“I'll independently review the action and ratify the same payload.”

[Click Ratify.]

“Now we have **2 of 2**.”

[Execute.]

---

### Arun

“The important detail here is that both humans are approving the **same action payload**.

So the system isn't simply counting clicks.

It verifies that the second approval corresponds to the same action.”

---

# 10. Explain the safety model — Arun

“Under the hood, Baton uses a payload hash for that approval flow.

The workflow is fail-closed.

That means cases such as:

wrong payload,

wrong room,

duplicate or invalid actor,

or an expired approval window

do not silently proceed.

They are rejected and recorded in the audit trail.”

---

# 11. Final handoff protection — Priya

**Priya:**

“Now let's test the final safety gate.

The incident has not yet completed its handoff.”

[Arun presses Close.]

**Priya:**

“Baton rejects the close.”

[Show `409`.]

“That is intentional.

The system will not let us close an unresolved handoff.”

---

### ACK

**Priya:**

“I'll acknowledge the handoff.”

[ACK.]

**Arun:**

“And now I can close the incident.”

[Close.]

“Now the close succeeds.”

---

# 12. Architecture — Arun

[Show architecture slide.]

“Let me summarize the architecture.

The frontend is built with **Next.js**.

**Liveblocks** provides real-time presence and collaboration.

**Moss** provides low-latency semantic retrieval for our operational SOP knowledge.

**Gemini Flash-Lite** handles generation.

And **Neon Postgres** stores durable workflow data such as approvals, audit records, and handoff state.

The important architectural separation is this:

**Live collaboration is real-time.
Critical workflow state is durable.**

That separation is what allows an agent or engineer to disappear without losing the incident.”

---

# 13. Why Moss matters — specifically for this hackathon

**Arun:**

“One thing we deliberately optimized for in this build was retrieval latency.

During an incident, the retrieval layer cannot become another source of delay.

Our Moss index is in-process for the query path, and the repository includes latency measurements and automated evaluation.

So Moss is not just another dependency in our stack.

It sits directly on the critical path of the investigation.”

---

# 14. Product / real-world value — Priya

**Priya:**

“And this is not limited to one specific incident workflow.

The same pattern applies anywhere an AI agent operates over time and another human or agent may need to take over.

For example:

production incidents,

security operations,

customer support escalations,

infrastructure operations,

and other human-in-the-loop agent workflows.

The common problem is the same:

**How do we transfer responsibility without losing state?**”

---

# 15. Business/product angle — Arun

“This also changes the product we are building.

We're not trying to replace engineers.

We're building the coordination layer around AI-assisted operations.

That means the value comes from reducing duplicated investigation, preserving operational context, and putting explicit controls around high-impact actions.

The AI can reason.

The humans retain control.

And the system preserves the state between them.”

---

# 16. Final close — Arun

“So the entire idea behind Baton comes down to one problem:

**AI agents are becoming part of operational workflows, but operational workflows cannot depend on one agent session staying alive forever.**

Baton makes the workflow continuous.

Two humans can share one live room.

An agent can fail and another can resume.

Risky actions require two humans.

And the incident cannot be closed until the handoff is acknowledged.

So our core principle is:

**When the people or agents change, the operational context should not disappear.**

That is Baton.

Thank you.”

---

# The 4 lines I want you to memorize

Do **not** memorize the entire script word-for-word. Memorize these four lines and let the demo demonstrate them:

### 1.

**“The room is the state.”**

### 2.

**“The successor continues from the checkpoint, not from zero.”**

### 3.

**“One human proposes. Another human ratifies.”**

### 4.

**“No ACK, no close.”**

Those four statements explain almost the entire product.

---

# How to divide the presentation between you

### Arun — Product + technical lead

You handle:

**Problem → Baton → architecture → AI retrieval → agent failure → approval system → final conclusion**

### Priya — Second operator

She handles:

**Joining room → redirecting investigation → taking over after agent failure → ratifying action → ACK**

That makes the presentation itself demonstrate your product's core concept: **two humans collaborating in the same operational room.**

---

# What NOT to do in front of this jury

Do not start with:

> “Our tech stack is Next.js, Liveblocks, Neon, Gemini…”

Start with the **production problem**.

Do not spend two minutes explaining database tables.

Do not explain every API route unless asked.

Do not repeatedly say “AI-powered.”

Instead, demonstrate exactly **what the AI does and where humans remain in control**.

And do not make unsupported claims such as “this completely solves incident response.” Say exactly what your implementation demonstrates.

### One important adjustment for the jury

When you reach the **Moss** portion, slow down slightly. This is a Moss-focused builder sprint, so the judges will likely care about **where retrieval sits in the actual product architecture**, not merely that Moss appears in the technology list. Your strongest explanation is:

> **“Moss is on the incident query path, retrieving operational context from our indexed SOP knowledge so the agent can answer from relevant evidence rather than starting from an empty context.”**

That connects the hackathon technology directly to the product rather than mentioning Moss as a checkbox.
