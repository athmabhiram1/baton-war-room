---
kind: finding
priority: 2
id: postmortem
title: Postmortem Template
---

# Postmortem Template

Postmortem is blameless and due within 5 business days. Audience is engineering and product leads who were not in war-room. Goal is systemic fixes, not individual fault.

Structure: summary 2 sentences, impact quantified as minutes, affected users, orders or revenue, error rate and data loss scope. Timeline UTC table with decision points and actors. Root cause with 5 whys and diagram linking trigger to impact. What went well: detection, mitigation speed, and coordination wins. What went poorly: gaps in runbooks, missing alerts, or handoff friction.

Action items must be SMART: specific owner, due date, and verification method. At least one item addresses detection, one mitigation speed, and one prevention. Link action items to tickets and track completion weekly until closed.

Tag postmortem as `kind:finding` priority 2; recall will surface it for similar incidents even when not high priority. Attach logs, dashboards, and decision hashes. Review in engineering weekly meeting and invite support for customer perspective.

Do not publish externally without comms lead review. Store in postmortem repo with search indexed.
