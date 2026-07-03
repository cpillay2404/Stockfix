---
name: Analytics data caveats
description: Known data-shape quirks in the StockFix tasks table that affect analytics/reporting dashboards
---

The `tasks.action_status` column is overwhelmingly `'Pending'` in the live dataset — completion rates across almost any weekly/action/region breakdown will look near-zero. This is expected given current usage (reps haven't completed most assigned tasks yet), not a bug in aggregation queries.

**Why:** When first building the Analytics/Trends dashboard, a near-zero "Completed" KPI initially looked like a query bug (e.g. wrong status string, wrong join). Verifying against `SELECT action_status, COUNT(*) FROM tasks GROUP BY action_status` confirmed the data itself is skewed this way.

**How to apply:** Before assuming a completion/status aggregation bug in a new report, first check the raw distribution of `action_status` (and similar status columns) directly in the DB — don't assume the query logic is wrong.
