---
name: Drizzle dynamic SQL limits
description: Reliable patterns for dynamic raw SQL against this project's PostgreSQL driver.
---

Do not interpolate JavaScript arrays into `ANY(...)` in raw Drizzle SQL, and do not build very large `sql.join` parameter lists for a large in-memory ID set. Array interpolation can create invalid SQL for this driver, while thousands of joined fragments can overflow Drizzle's SQL-builder call stack.

**Why:** Manager progress filtering hit both failure modes: PostgreSQL rejected the generated array expression, and an attempted large `IN` list exceeded the SQL builder's recursion depth.

**How to apply:** Use set-based joins and SQL predicates to keep filtering in the database. When consuming raw `select` output in camelCase application code, explicitly alias snake_case columns rather than relying on ORM mapping.