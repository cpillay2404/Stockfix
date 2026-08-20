---
name: Retired Store Overview links
description: User-facing policy for older Store Overview URLs.
---

Older Store Overview URLs must redirect silently into the current Nexus workflow. They must not render the retired UI or send end users to a not-found screen.

**Why:** Existing bookmarks and deep links should remain useful without exposing obsolete screens.

**How to apply:** Preserve visit context when redirecting an older link, and document only the current user-facing screens in end-user materials.