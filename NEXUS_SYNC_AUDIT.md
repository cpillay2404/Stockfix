# Nexus Live-Call Audit — What Needs to Move Into the Weekly Sync

**Goal:** the rep-facing app should never call Nexus live while someone is standing in a store. Everything below currently does, and needs a synced/local equivalent.

## Real Nexus stems currently called live

| Stem | Used for | Called from |
|---|---|---|
| `store_current` | Store-level header numbers (totalSkus, oosCount, lowStockCount, overstockCount, negSOHCount, healthScore) | `fetchStoreOverview`, `fetchStoreIssueCount`, `fetchLiveIssueCounts` |
| `oos_detail` | Out of Stock SKU rows, missed units, DC-available counts | `fetchStoreOverview`, `fetchIssueDetailList` |
| `low_stock_detail` | Low Stock SKU rows, suggested-order units, DC-fulfillable | `fetchStoreOverview`, `fetchIssueDetailList` |
| `overstock_detail` | Overstock SKU rows | `fetchIssueDetailList` |
| `store_sku_current` | Every ranged SKU at a store (full line list) - At Risk, Cover Analysis, Negative SOH, Cover Distribution, the SKU dropdown, and per-SKU 13-week history all derive from this | `fetchStoreSkuList`, `fetchSkuHistory` |
| `distribution_gaps` | Distribution Gap rows + real coverage % | `fetchDistributionGapsForStore` |

**Already synced (fast, no live call needed):** `totalSkus`, `storeSoh`, `salesP4`, `oosCount`, `lowStockCount`, `overstockCount`, `dcAvailabilityPct`, `avgWeeksOfCover`, `salesAtRiskSkuCount`, `negSohCount` - these live in `store_weekly_summary` already (added across tonight's session).

## Checklist - what still needs a synced table

- [ ] Full per-SKU line list (`store_sku_current` equivalent) - one row per barcode per store per client per week: storeSoh, dcSoh, sellOutP4, cover (WFC), classification, avgWeeklySales. This single table would replace almost every live call below.
- [ ] OOS/Low Stock/Overstock detail fields not on `store_sku_current` - estimatedMissedUnits, suggestedOrderUnits, dcFulfillableUnits, issueDriver, priority, consecutiveWeeksOOS (real Nexus fields, currently only fetched from the *_detail stems)
- [ ] Distribution Gaps rows - barcode, gapType, suggestedAction, per store (currently only missingSkus/avgCoverage counts are synced, not the actual SKU rows)
- [ ] Per-SKU 13-week history - needed for the SOH/Sales trend charts on SKU detail; currently 13 live calls per SKU, per view
- [ ] Live-only overview numbers to pre-compute during sync: missedUnits, dcAvailableCount, noDcStockCount, suggestedOrderSkuCount/UnitsTotal/DcSupportedCount, immediateActionCount, optimalCount, chronicUnderstockCount, topIssues, real atRiskCount, real distributionGapsCount
- [ ] "All Clients" combined view - once the above is local, this becomes a plain database sum instead of a 40-call live fan-out per client

## What this eliminates once built

Every current live call site: store-overview (both single-client and All-Clients paths), sku-list (all 7 classifications), sku-detail/sku-history, supply-detail, analysis-index, fix-index - all become local reads.

## Not in scope for this checklist

- The weekly sync job itself still has to call Nexus live once a week - that's unavoidable and correct, it's the rep-facing app that should never do it.
- Moving to daily sync later doesn't change this checklist - same tables, just synced more often.
