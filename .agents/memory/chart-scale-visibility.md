---
name: Recharts bar chart scale must fit real data range
description: Fixed 0-100% axis domains make low-magnitude real-world percentages (e.g. single-digit capture rates) invisible as bars
---

When charting a percentage/rate metric with Recharts (or similar), do not hardcode the axis domain to `[0, 100]` if the real data values cluster far below that (e.g. capture rates of 0-6%). The bars become imperceptibly thin slivers and the chart appears "broken" or "not visible" even though data is loading correctly.

**Why:** On the StockFix merchandiser-pilot dashboard, a region breakdown bar chart used a fixed `[0, 100]` domain, but real production capture rates were all in the 0-6% range. Every bar rendered at <6% width — visually indistinguishable from empty. The bug was invisible in code review and only surfaced by seeding realistic-scale test data and screenshotting the actual render.

**How to apply:** Compute the axis max dynamically from the actual data (e.g. `ceil(maxValue * 1.25)`, rounded to a nice step, capped at the metric's true max like 100). Also set a `minPointSize` (or equivalent) on the bar so near-zero-but-nonzero values still render a visible sliver instead of disappearing. When a user reports a chart/component as "not visible" in production but the API confirms data is present, seed dev with data at the *real* production magnitude (not arbitrary round numbers) before assuming it's a fetch/render-crash bug — scale mismatches are a common and easy-to-miss cause.
