---
name: Visit continuity guard
description: Rules for preventing abandonment of captured visits while keeping summary context accurate.
---

An open visit belongs to the saved capture context, not to whichever client filter or store screen is currently visible. Exit prompts must target the active visit's saved store, rep, and client values; preserve these exact values because the visit-summary query filters rep and client exactly.

**Why:** A capture made from an all-clients view can belong to a concrete client. Users can then change filters or reach an earlier store through browser history. Guarding only the current screen can either allow the visit to be abandoned or send the summary for the wrong context.

**How to apply:** Permit in-store navigation only within the saved visit's store and rep. Before any route leaves that context, show the End Visit prompt. Resolve its destination from the stored active visit at click time; use normalized values only for identity comparison, never for summary request values.