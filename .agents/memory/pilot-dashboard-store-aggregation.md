---
name: Pilot dashboard store aggregation
description: How merchandiser-pilot.tsx derives store-level stats when the backend only returns rep-level data
---

`/api/pilot-report` returns data organized by merchandiser (rep) → their assigned stores, not by store → reps. There is no store-level rollup or per-store weekly history endpoint.

**Why:** The merchandiser-pilot Store Detail page needs store-level totals (tasks, completed, capture rate, reps, clients) across all reps working that store. Adding a new backend endpoint wasn't necessary since the existing payload already contains everything needed per rep.

**How to apply:** When building store-level views for this page, aggregate client-side by iterating `data.merchandisers[].stockFix.stores` and grouping by store name (sum tasks/completed, collect rep list, dedupe client tags). Don't expect a trend chart at the store level — only the overall `history` array (aggregated across all reps) is available from the API.
