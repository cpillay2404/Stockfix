---
name: Deployment artifact freshness
description: How to detect and prevent production serving an older compiled server bundle.
---

Before publishing a backend change, ensure the committed source is newer than the generated `dist/index.cjs`, run the production build, and verify the expected route marker is present in the rebuilt bundle.

**Why:** A deployment started `node dist/index.cjs` successfully while that artifact predated the committed server route by hours. The live API therefore served the older response shape even though Git history contained the new code. Runtime deployment logs confirmed the start command but did not include build-worker output.

**How to apply:** Run `npm run build`, inspect the `dist/index.cjs` timestamp and search it for the changed route/error marker, then publish. Confirm the production response with a direct curl, not browser caching behavior.