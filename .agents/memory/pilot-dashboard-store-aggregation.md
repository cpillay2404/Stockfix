---
name: Pilot dashboard store aggregation
description: How merchandiser-pilot.tsx derives store-level stats when the backend only returns rep-level data
---

`/api/pilot-report` returns data organized by merchandiser (rep) → their assigned stores, not by store → reps. There is no store-level rollup or per-store weekly history endpoint.

**Why:** The merchandiser-pilot Store Detail page needs store-level totals (tasks, completed, capture rate, reps) across all reps working that store. Adding a new backend endpoint wasn't necessary since the existing payload already contains everything needed per rep.

**How to apply:** For rep-level rollups (tasks/completed/capture rate per store, for the "Tasks by Merchandiser" chart), aggregate client-side by iterating `data.merchandisers[].stockFix.stores` and grouping by store name. Don't expect a trend chart at the store level — only the overall `history` array (aggregated across all reps) is available from the API.

**Update:** `/api/pilot-report` now also accepts `manager`/`region`/`store`/`banner` query params and returns a flat `taskDetail` array (article/task-level rows, capped at 3000, filtered server-side by those params) plus `managerBreakdown`/`regionBreakdown`/`top5Merchandisers`/`bottom5Merchandisers`. For article-level tables (store name, article, barcode, SOH/WFC, action, reason code, feedback, image), use `data.taskDetail` directly (filter client-side by `storeName` for a single store's page) rather than re-deriving it from `merchandisers[].stockFix.stores`, which only has store-level totals, not per-article rows.
