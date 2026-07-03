---
name: Splash screen skip list
description: Which routes must be added to the App.tsx splash-skip list to avoid a forced 5s branded splash screen
---

The root `App.tsx` shows a branded SplashScreen (minDisplayTime ~5000ms) on first load for every route, unless the route is explicitly listed in a `skipSplash` check (e.g. `location === '/merchandiser-pilot' || location === '/inventory' || location === '/analytics'`).

**Why:** Full-page standalone dashboards (Inventory Hub, Merchandiser Pilot, Analytics) are meant to feel like direct-access tools, not part of the mobile rep flow, so forcing users to wait through the splash screen every time they open one is bad UX. Regular in-flow pages (dashboard, task-detail, etc.) are fine going through the splash since it's part of the app's normal cold-start experience.

**How to apply:** Whenever adding a new standalone/full-page dashboard route (accessed directly by URL, not part of the rep task-completion flow), add its path to the `skipSplash` boolean in `client/src/App.tsx`.
