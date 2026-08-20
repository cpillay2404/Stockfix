---
name: Resource client scope
description: Business rules for rep and merchandiser client filtering and the intentionally separate Client access path.
---

Dedicated SodaStream, Duracell, Aquelle, and P&G resource types may only view
their named client. Fieldmarketers are P&G-only. Resource type takes precedence
over stale or incomplete assignment rows; store assignments then constrain the
rep's valid stores. Syndicated resources may view the live clients eligible at
their assigned store and may choose one of those clients or the combined eligible
view.

**Why:** Assignment imports can label a dedicated resource as `SYNDICATED`, and
the user explicitly confirmed Fieldmarketers are P&G-only. Falling back to a
different client's data is not acceptable for a locked resource.

**How to apply:** Bind rep- and merchandiser-scoped requests to the signed
identity and employee-ID store assignment, rather than trusting `rep` or
`client` query parameters. Treat the Client flow separately: it intentionally
remains open for browsing until client passwords are enabled, so do not describe
it as a rep/merch permission boundary.