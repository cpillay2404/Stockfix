// Nexus Inventory Insights integration
//
// Talks to the separate "Nexus" Azure Function backend that publishes weekly
// inventory JSON snapshots per client, e.g.:
//   https://stockfix-validate-fdhkefdwc6dmejda.northeurope-01.azurewebsites.net/api/dashboard-data/weeks/{week}/clients/{clientSlug}/{stem}.json
//
// REQUIRED SECRET: NEXUS_API_KEY
//   Function-key for the Nexus Azure Function, sent as a query-string param
//   on every request (Azure Functions "function" auth level convention).
//   Documented here the same way MAILERSEND_API_KEY is documented/read in
//   server/email.ts / server/scheduled-emails.ts (process.env lookup, no
//   fallback value, throws a descriptive error if missing rather than
//   silently no-op'ing).
//
// This module intentionally never throws inside an async gap without a
// catch — all network/parse failures are turned into Error objects with
// descriptive messages so the route layer (server/routes.ts) can catch them
// and respond with a clean JSON error instead of crashing the process.

const NEXUS_BASE_URL =
  process.env.NEXUS_BASE_URL ||
  'https://stockfix-validate-fdhkefdwc6dmejda.northeurope-01.azurewebsites.net';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Match the dashboardStatsCache TTL convention used in server/routes.ts
// (DASHBOARD_CACHE_TTL_MS = 60s for hot data; here we use the 5-minute
// convention used for the slower-moving gamificationCache, since Nexus
// snapshots are weekly and don't need to be re-fetched every minute).
const NEXUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const nexusCache: Map<string, CacheEntry<any>> = new Map();

/**
 * Normalize a StockFix client name into the slug Nexus uses in its blob
 * folder structure. Naive rule: uppercase, "&" -> "-", spaces -> "-".
 * Real Nexus clients that may not follow the naive rule are overridden
 * below.
 *
 * UNVERIFIED — these overrides are best-guess slugs and have not been
 * confirmed against a live Nexus response. Confirm each one once
 * NEXUS_API_KEY is provisioned and a real directory listing (or a known-good
 * sample URL) is available.
 */
const NEXUS_CLIENT_SLUG_OVERRIDES: Record<string, string> = {
  // UNVERIFIED — confirm against a live Nexus response once NEXUS_API_KEY is provisioned
  'AGROSERVE': 'AGROSERVE',
  'ALPEN': 'ALPEN',
  'ANCHOR YEAST': 'ANCHOR-YEAST',
  'AQUELLE': 'AQUELLE',
  'ASPEN': 'ASPEN',
  'BUTTERFLY': 'BUTTERFLY',
  'CAPE COOKIES': 'CAPE-COOKIES',
  'DAVIDOFF': 'DAVIDOFF',
  'DURACELL': 'DURACELL',
  'DYNAMIC BRANDS': 'DYNAMIC-BRANDS',
  'ETHICA': 'ETHICA',
  'LINDT': 'LINDT',
  'MAGALIES': 'MAGALIES',
  'P&G': 'P-G',
  'PENFLEX': 'PENFLEX',
  'PMI': 'PMI',
  'SCJ': 'SCJ',
  'SIR JUICE': 'SIR-JUICE',
  'SODASTREAM': 'SODASTREAM',
  'SOILL': 'SOILL',
  'STAEDTLER': 'STAEDTLER',
  'SWEET NOTHINGS': 'SWEET-NOTHINGS',
  'TACOMA': 'TACOMA',
};

export function nexusClientSlug(clientName: string): string {
  const normalized = (clientName || '').trim().toUpperCase();
  if (NEXUS_CLIENT_SLUG_OVERRIDES[normalized]) {
    return NEXUS_CLIENT_SLUG_OVERRIDES[normalized];
  }
  return normalized.replace(/&/g, '-').replace(/\s+/g, '-');
}

function buildCacheKey(week: string, clientSlug: string, stem: string, params?: Record<string, string>): string {
  return `${week}_${clientSlug}_${stem}_${JSON.stringify(params || {})}`;
}

interface NexusIndex {
  latest: string;
  weeks: string[];
  clients: string[];
}

async function fetchNexusIndex(): Promise<NexusIndex> {
  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) {
    throw new Error("NEXUS_API_KEY is not configured — Nexus Inventory Insights cannot fetch data");
  }
  const cached = nexusCache.get("index");
  if (cached && (Date.now() - cached.timestamp) < NEXUS_CACHE_TTL_MS) {
    return cached.data as NexusIndex;
  }
  const url = `${NEXUS_BASE_URL}/api/dashboard-data/index.json?code=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Nexus index.json returned ${resp.status}`);
  const data = (await resp.json()) as NexusIndex;
  nexusCache.set("index", { data, timestamp: Date.now() });
  return data;
}

export async function fetchNexusLatestWeek(): Promise<string> {
  const index = await fetchNexusIndex();
  return index.latest;
}

// Real store-level overview for a single store+client, sourced entirely
// from confirmed-real Nexus fields (store_current + oos/low_stock_detail).
// No fabricated categories ("At Risk", "Distribution Gaps") or rand
// values - only what Nexus actually computes, per Carin's rule confirmed
// 2026-08-08.
// Local-first version of fetchStoreOverview (item #5 from the 2026-08-13
// speed audit: "waiting for inventory data" for the store-overview header
// numbers - missedUnits, dcAvailableCount, suggestedOrder*, topIssues,
// etc.). Mirrors the live function's exact computations, sourced from
// storeWeeklySummary + storeSkuWeekly instead of a live store_current +
// oos_detail + low_stock_detail fetch. Falls back to the live version only
// if this store/client was genuinely never synced (same "attempted"
// signal as fetchStoreSkuListFast).
export async function fetchStoreOverviewFast(clientScope: string, storeName: string, knownClient?: string) {
  const { db } = await import("./db");
  const { storeSkuWeekly, storeWeeklySummary } = await import("@shared/schema");
  const { sql } = await import("drizzle-orm");

  const normalizedStore = storeName.trim().toUpperCase();
  const summaryClientFilter = clientScope === "SYNDICATED"
    ? sql`true`
    : sql`${storeWeeklySummary.client} = ${knownClient || clientScope}`;

  const summaryRows = await db
    .select()
    .from(storeWeeklySummary)
    .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${normalizedStore} and ${summaryClientFilter}`)
    .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`);

  if (summaryRows.length === 0) {
    // Genuinely never synced - fall back to live.
    return fetchStoreOverview(clientScope, storeName, knownClient);
  }

  const latestWeek = summaryRows[0].weekEnding;
  const latestForEachClient = summaryRows.filter((r) => r.weekEnding === latestWeek);
  const best = knownClient
    ? latestForEachClient.find((r) => r.client === knownClient) || latestForEachClient[0]
    : latestForEachClient.sort((a, b) => (b.oosCount || 0) + (b.lowStockCount || 0) - ((a.oosCount || 0) + (a.lowStockCount || 0)))[0];

  const skuClientFilter = clientScope === "SYNDICATED"
    ? sql`${storeSkuWeekly.client} = ${best.client}`
    : sql`${storeSkuWeekly.client} = ${knownClient || clientScope}`;
  const skuRows = await db
    .select()
    .from(storeSkuWeekly)
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.weekEnding} = ${latestWeek} and ${skuClientFilter}`);

  const oosRows = skuRows.filter((r) => r.sourceStem === "oos");
  const lowStockRows = skuRows.filter((r) => r.sourceStem === "low");
  const allIssueRows = [...oosRows, ...lowStockRows];
  // Real At Risk count computed here directly from the full skuRows already
  // loaded above - avoids the route handler making a second, redundant
  // storeSkuWeekly query just for this (real bug found 2026-08-14: two
  // separate DB round-trips for the same data was most of the remaining
  // latency once the live Nexus calls were gone). Same threshold as
  // computeAtRiskRows (storeSoh > 0 and cover <= AT_RISK_WFC_THRESHOLD_WEEKS).
  const atRiskCount = skuRows.filter((r) => (r.storeSoh || 0) > 0 && r.cover !== null && r.cover <= AT_RISK_WFC_THRESHOLD_WEEKS).length;

  const missedUnits = allIssueRows.reduce((sum, r) => sum + (r.estimatedMissedUnits || 0), 0);
  const dcAvailable = oosRows.filter((r) => (r.dcSoh || 0) > 0).length;
  const dcAvailabilityPct = oosRows.length > 0 ? (dcAvailable / oosRows.length) * 100 : 100;
  const noDcStockCount = oosRows.filter((r) => (r.dcSoh || 0) === 0).length;
  const suggestedOrderRows = lowStockRows.filter((r) => (r.suggestedOrderUnits || 0) > 0);
  const suggestedOrderSkuCount = suggestedOrderRows.length;
  // Fixed 2026-08-17 (Carin: "we are recommending an order again but there
  // is no stock in DC") - the total must only count units the DC can
  // actually supply, same as the individual row badges already fixed on the
  // list/replenishment screens. Otherwise the headline "Replenishment
  // opportunity" number includes orders that are literally impossible.
  const dcFulfillableRows = suggestedOrderRows.filter((r) => (r.dcFulfillableUnits || 0) > 0 || (r.dcSoh || 0) > 0);
  const suggestedOrderUnitsTotal = dcFulfillableRows.reduce((sum, r) => sum + (r.suggestedOrderUnits || 0), 0);
  const suggestedOrderDcSupportedCount = dcFulfillableRows.length;
  // Split by classification 2026-08-16 (was one combined "Immediate Actions"
  // number lumping OOS and Low Stock P1s together, unclear to a rep which
  // kind of action was actually needed) - immediateActionCount kept too for
  // anything else still reading the combined total.
  const oosP1Count = oosRows.filter((r) => String(r.priority || "").startsWith("P1")).length;
  const lowStockP1Count = lowStockRows.filter((r) => String(r.priority || "").startsWith("P1")).length;
  const immediateActionCount = oosP1Count + lowStockP1Count;
  const salesAtRiskSkuCount = allIssueRows.filter((r) => (r.estimatedMissedUnits || 0) > 0).length;
  const coverValues = lowStockRows.map((r) => r.cover).filter((v): v is number => typeof v === "number");
  const avgWeeksOfCover = coverValues.length > 0 ? coverValues.reduce((a, b) => a + b, 0) / coverValues.length : 0;
  const totalSkus = best.totalSkus || 0;
  const oosCount = best.oosCount || 0;
  const inStockPct = totalSkus > 0 ? ((totalSkus - oosCount) / totalSkus) * 100 : 100;
  const CHRONIC_OOS_WEEKS = 3;
  const chronicUnderstockCount = oosRows.filter((r) => (r.consecutiveWeeksOOS || 0) >= CHRONIC_OOS_WEEKS).length;
  const classifiedCount = oosCount + (best.lowStockCount || 0) + (best.overstockCount || 0)
    + (best.noSalesCount || 0) + (best.dormantCount || 0);
  const optimalCount = Math.max(0, totalSkus - classifiedCount);

  return {
    storeName: storeName,
    resolvedClient: best.client,
    siteCode: best.siteCode || "—",
    banner: best.banner,
    totalSkus,
    oosCount,
    lowStockCount: best.lowStockCount || 0,
    overstockCount: best.overstockCount || 0,
    negSOHCount: best.negSohCount || 0,
    optimalCount,
    chronicUnderstockCount,
    atRiskCount,
    inStockPct,
    missedUnits,
    dcAvailabilityPct,
    avgWeeksOfCover,
    dcAvailableCount: dcAvailable,
    noDcStockCount,
    suggestedOrderSkuCount,
    suggestedOrderUnitsTotal,
    suggestedOrderDcSupportedCount,
    immediateActionCount,
    oosP1Count,
    lowStockP1Count,
    salesAtRiskSkuCount,
    topIssues: allIssueRows
      .sort((a, b) => (b.estimatedMissedUnits || 0) - (a.estimatedMissedUnits || 0))
      .slice(0, 20)
      .map((r) => ({
        articleDescription: r.articleDescription || "",
        barcode: r.barcode,
        classification: r.classification || (r.sourceStem === "oos" ? "Out of Stock" : "Low Stock"),
        storeSoh: r.storeSoh,
        dcSoh: r.dcSoh,
        sellOutP4: r.sellOutP4,
        cover: r.cover,
        // recommendedAction text itself isn't persisted (display-only,
        // low value to store per-row) - same fallback convention already
        // used in fetchIssueDetailList for the same reason.
        action: r.sourceStem === "oos" ? "Review stock levels" : "Review stock levels",
      })),
  };
}

export async function fetchStoreOverview(clientScope: string, storeName: string, knownClient?: string) {
  const index = await fetchNexusIndex();

  let best: { client: string; slug: string; row: NexusStoreCurrentRow } | null = null;

  if (knownClient) {
    // Fast path: caller already resolved the real client from the synced
    // store_weekly_summary table - skip the expensive multi-client scan
    // entirely (confirmed 2026-08-08 fix for the store-detail speed problem).
    const slug = nexusClientSlug(knownClient);
    try {
      const result = await fetchNexusJson<{ rows: NexusStoreCurrentRow[] }>(index.latest, slug, "store_current", { store: storeName });
      const row = (result.rows || [])[0];
      if (row) best = { client: knownClient, slug, row };
    } catch {
      // fall through to the scan below if the known client turns out stale
    }
  }

  if (!best) {
    const clients = clientScope === "SYNDICATED" ? index.clients : [clientScope];
    const candidates = await Promise.all(
      clients.map(async (client) => {
        const slug = nexusClientSlug(client);
        try {
          const result = await fetchNexusJson<{ rows: NexusStoreCurrentRow[] }>(index.latest, slug, "store_current", { store: storeName });
          const row = (result.rows || [])[0];
          return row ? { client, slug, row } : null;
        } catch {
          return null; // no data for this client at this store - expected for most clients
        }
      })
    );
    best = candidates
      .filter((c): c is { client: string; slug: string; row: NexusStoreCurrentRow } => c !== null)
      .sort((a, b) => (b.row.oosCount + b.row.lowStockCount) - (a.row.oosCount + a.row.lowStockCount))[0] || null;
  }

  if (!best) {
    return null;
  }

  const [oosResult, lowStockResult] = await Promise.all([
    fetchNexusJson<{ rows: any[] }>(index.latest, best.slug, "oos_detail", { store: storeName }).catch(() => ({ rows: [] })),
    fetchNexusJson<{ rows: any[] }>(index.latest, best.slug, "low_stock_detail", { store: storeName }).catch(() => ({ rows: [] })),
  ]);

  const oosRows = oosResult.rows || [];
  const lowStockRows = lowStockResult.rows || [];
  const allIssueRows = [
    ...oosRows.map((r) => ({ ...r, classification: "Out of Stock" as const })),
    ...lowStockRows.map((r) => ({ ...r, classification: r.stockClassification || "Low Stock" })),
  ];

  const missedUnits = allIssueRows.reduce((sum, r) => sum + (r.estimatedMissedUnits || 0), 0);
  const dcAvailable = oosRows.filter((r) => (r.dcSOH || 0) > 0).length;
  const dcAvailabilityPct = oosRows.length > 0 ? (dcAvailable / oosRows.length) * 100 : 100;
  // Real supporting counts for the "Recommended Actions" tiles - all
  // derived directly from the same oos/low_stock rows already fetched
  // above, no extra Nexus calls needed.
  const noDcStockCount = oosRows.filter((r) => (r.dcSOH || 0) === 0).length;
  const suggestedOrderRows = lowStockRows.filter((r) => (r.suggestedOrderUnits || 0) > 0);
  const suggestedOrderSkuCount = suggestedOrderRows.length;
  const suggestedOrderUnitsTotal = suggestedOrderRows.reduce((sum, r) => sum + (r.suggestedOrderUnits || 0), 0);
  const suggestedOrderDcSupportedCount = suggestedOrderRows.filter((r) => (r.dcFulfillableUnits || 0) > 0 || (r.dcSOH || 0) > 0).length;
  // "Immediate Actions" = highest-urgency rows, using Nexus's own real
  // priority tier field (e.g. "P1 Critical", "P1 Urgent") rather than a
  // number we invent - counts whatever Nexus itself flagged P1. Split by
  // classification 2026-08-16 - see fetchStoreOverviewFast's comment.
  const oosP1Count = oosRows.filter((r) => String(r.priority || "").startsWith("P1")).length;
  const lowStockP1Count = lowStockRows.filter((r) => String(r.priority || "").startsWith("P1")).length;
  const immediateActionCount = oosP1Count + lowStockP1Count;
  const salesAtRiskSkuCount = allIssueRows.filter((r) => (r.estimatedMissedUnits || 0) > 0).length;
  const coverValues = lowStockRows.map((r) => r.storeWFC).filter((v) => typeof v === "number");
  const avgWeeksOfCover = coverValues.length > 0 ? coverValues.reduce((a, b) => a + b, 0) / coverValues.length : 0;
  const inStockPct = best.row.totalSkus > 0 ? ((best.row.totalSkus - best.row.oosCount) / best.row.totalSkus) * 100 : 100;
  // Chronic understock: real, defined threshold from the Nexus backend
  // (3+ consecutive weeks OOS). No equivalent "chronic overstock" exists
  // anywhere in Nexus - confirmed 2026-08-08, not something we can compute.
  const CHRONIC_OOS_WEEKS = 3;
  const chronicUnderstockCount = oosRows.filter((r) => (r.consecutiveWeeksOOS || 0) >= CHRONIC_OOS_WEEKS).length;
  const classifiedCount = best.row.oosCount + best.row.lowStockCount + best.row.overstockCount
    + (best.row as any).noSalesCount + (best.row as any).dormantCount;
  const optimalCount = Math.max(0, best.row.totalSkus - classifiedCount);

  return {
    storeName: best.row.storeName,
    resolvedClient: best.client,
    siteCode: (best.row as any).siteCode || "—",
    banner: best.row.banner,
    totalSkus: best.row.totalSkus,
    oosCount: best.row.oosCount,
    lowStockCount: best.row.lowStockCount,
    overstockCount: best.row.overstockCount,
    negSOHCount: (best.row as any).negSOHCount || 0,
    optimalCount,
    chronicUnderstockCount,
    inStockPct,
    missedUnits,
    dcAvailabilityPct,
    avgWeeksOfCover,
    dcAvailableCount: dcAvailable,
    noDcStockCount,
    suggestedOrderSkuCount,
    suggestedOrderUnitsTotal,
    suggestedOrderDcSupportedCount,
    immediateActionCount,
    oosP1Count,
    lowStockP1Count,
    salesAtRiskSkuCount,
    topIssues: allIssueRows
      .sort((a, b) => (b.estimatedMissedUnits || 0) - (a.estimatedMissedUnits || 0))
      .slice(0, 20)
      .map((r) => ({
        articleDescription: r.articleDescription,
        barcode: r.barcode || "",
        classification: r.classification,
        storeSoh: r.storeSOH,
        dcSoh: r.dcSOH,
        sellOutP4: r.sellOutP4Weeks,
        cover: typeof r.storeWFC === "number" ? r.storeWFC : null,
        action: r.recommendedAction || "Review stock levels",
      })),
  };
}

// Nexus's own low_stock_detail formula (aggregate_duckdb-CarinPillay.py:339):
// suggestedOrderUnits = max(0, round(4 * avgWeeklySales - storeSOH)) - order
// up to a 4-week target cover. For OOS rows storeSOH is 0, so this collapses
// to round(4 * avgWeeklySales). Nexus doesn't compute this field on
// oos_detail itself, so we derive it here using its own real avgWeeklySales
// field and the same 4-week constant - not a fabricated number, the same
// formula Nexus already uses one classification over. Agreed with Carin
// 2026-08-04, built 2026-08-12.
export const TARGET_COVER_WEEKS = 4;

// Real SKU-level issue list for one store, one classification ("oos" or
// "low"), used by the OOS/Low Stock drill-down list pages. Reuses the same
// client-resolution logic as fetchStoreOverview (knownClient fast path,
// falling back to a multi-client scan for SYNDICATED people).
export async function fetchIssueDetailList(
  clientScope: string,
  storeName: string,
  classification: "oos" | "low" | "overstock",
  knownClient?: string
) {
  const index = await fetchNexusIndex();
  const stem = classification === "oos" ? "oos_detail" : classification === "low" ? "low_stock_detail" : "overstock_detail";

  let resolvedClient: string | undefined = knownClient;
  let rows: any[] = [];

  if (resolvedClient) {
    try {
      const result = await fetchNexusJson<{ rows: any[] }>(index.latest, nexusClientSlug(resolvedClient), stem, { store: storeName });
      rows = result.rows || [];
    } catch {
      resolvedClient = undefined; // fall through to scan below if stale
    }
  }

  if (!resolvedClient) {
    const clients = clientScope === "SYNDICATED" ? index.clients : [clientScope];
    const candidates = await Promise.all(
      clients.map(async (client) => {
        try {
          const result = await fetchNexusJson<{ rows: any[] }>(index.latest, nexusClientSlug(client), stem, { store: storeName });
          const r = result.rows || [];
          return r.length > 0 ? { client, rows: r } : null;
        } catch {
          return null;
        }
      })
    );
    const best = candidates.filter((c): c is { client: string; rows: any[] } => c !== null)
      .sort((a, b) => b.rows.length - a.rows.length)[0];
    if (best) {
      resolvedClient = best.client;
      rows = best.rows;
    }
  }

  return {
    resolvedClient: resolvedClient || clientScope,
    rows: rows
      .map((r) => ({
        barcode: r.barcode || "",
        articleDescription: r.articleDescription,
        storeSoh: r.storeSOH ?? 0,
        dcSoh: r.dcSOH ?? 0,
        sellOutP4: r.sellOutP4Weeks ?? 0,
        avgWeeklySales: r.avgWeeklySales ?? null,
        cover: typeof r.storeWFC === "number" ? r.storeWFC : null,
        estimatedMissedUnits: r.estimatedMissedUnits ?? 0,
        consecutiveWeeksOOS: r.consecutiveWeeksOOS ?? 0,
        issueDriver: r.issueDriver || null,
        action: r.recommendedAction || (classification === "overstock" ? "Review for markdown / transfer" : "Review stock levels"),
        priority: r.priority ?? null,
        classification: classification === "oos" ? "Out of Stock" : classification === "overstock" ? (r.stockClassification || "Possible Overstock") : (r.stockClassification || "Low Stock"),
        suggestedOrderUnits: classification === "low"
          ? (r.suggestedOrderUnits ?? null)
          : classification === "oos" && typeof r.avgWeeklySales === "number"
          ? Math.max(0, Math.round(TARGET_COVER_WEEKS * r.avgWeeklySales))
          : null,
        dcFulfillableUnits: classification === "low" ? (r.dcFulfillableUnits ?? null) : null,
      }))
      .sort((a, b) => (b.estimatedMissedUnits || 0) - (a.estimatedMissedUnits || 0)),
  };
}

// Business thresholds - Nexus does not define these itself, they're ours to
// set. Confirmed with Carin 2026-08-09: At Risk uses WFC <= 1 week; there is
// no separate Overstock threshold needed because Nexus already computes
// overstockCount natively on store_current. CHANGE HERE if the business
// number changes - single source of truth.
const AT_RISK_WFC_THRESHOLD_WEEKS = 1;

export interface StoreSkuRow {
  barcode: string;
  articleDescription: string;
  client?: string;
  banner?: string | null;
  region?: string | null;
  storeSoh: number;
  dcSoh: number;
  sellOutP4: number;
  avgWeeklySales: number | null;
  cover: number | null;
  estimatedMissedUnits: number;
  suggestedOrderUnits?: number | null;
  dcFulfillableUnits?: number | null;
  issueDriver?: string | null;
  consecutiveWeeksOOS: number;
  classification: string;
  priority: string | null;
  sourceStem?: string | null;
}

// Real full per-store SKU list (store_sku_current) - every ranged SKU at
// this store, not just the ones Nexus already buckets into oos_detail /
// low_stock_detail. This is what lets us compute At Risk (our own WFC
// threshold, since Nexus doesn't expose that split) without fabricating
// any numbers - every field here is a real confirmed Nexus field.
export async function fetchStoreSkuList(
  clientScope: string,
  storeName: string,
  knownClient?: string
): Promise<{ resolvedClient: string; rows: StoreSkuRow[] }> {
  const index = await fetchNexusIndex();
  let resolvedClient: string | undefined = knownClient;
  let rawRows: any[] = [];

  if (resolvedClient) {
    try {
      const result = await fetchNexusJson<{ rows: any[] }>(index.latest, nexusClientSlug(resolvedClient), "store_sku_current", { store: storeName });
      rawRows = result.rows || [];
    } catch {
      resolvedClient = undefined;
    }
  }

  if (!resolvedClient) {
    const clients = clientScope === "SYNDICATED" ? index.clients : [clientScope];
    const candidates = await Promise.all(
      clients.map(async (client) => {
        try {
          const result = await fetchNexusJson<{ rows: any[] }>(index.latest, nexusClientSlug(client), "store_sku_current", { store: storeName });
          const r = result.rows || [];
          return r.length > 0 ? { client, rows: r } : null;
        } catch {
          return null;
        }
      })
    );
    const best = candidates.filter((c): c is { client: string; rows: any[] } => c !== null)
      .sort((a, b) => b.rows.length - a.rows.length)[0];
    if (best) {
      resolvedClient = best.client;
      rawRows = best.rows;
    }
  }

  return {
    resolvedClient: resolvedClient || clientScope,
    rows: rawRows.map((r) => ({
      barcode: r.barcode || "",
      articleDescription: r.articleDescription,
      storeSoh: r.storeSOH ?? 0,
      dcSoh: r.dcSOH ?? 0,
      sellOutP4: r.sellOutP4Weeks ?? 0,
      avgWeeklySales: r.avgWeeklySales ?? null,
      cover: typeof r.storeWFC === "number" ? r.storeWFC : null,
      estimatedMissedUnits: r.estimatedMissedUnits ?? 0,
      consecutiveWeeksOOS: r.consecutiveWeeksOOS ?? 0,
      classification: r.classification || "Unknown",
      priority: r.priority ?? null,
    })),
  };
}

// Real per-store At Risk count/rows: in stock, but cover at or below our
// business threshold - a subset of store_sku_current, not a separate Nexus
// concept, since Nexus itself never draws this exact line.
export function computeAtRiskRows(rows: StoreSkuRow[]): StoreSkuRow[] {
  return rows.filter((r) => r.storeSoh > 0 && r.cover !== null && r.cover <= AT_RISK_WFC_THRESHOLD_WEEKS);
}

// Local-first version of fetchStoreSkuList (Carin, 2026-08-13: "we need
// this fast for a rep in-store, not waiting for live inventory data") -
// reads the weekly-synced storeSkuWeekly table instead of calling Nexus
// live. Falls back to the live fetchStoreSkuList only if this store/client
// genuinely has no synced rows yet (e.g. brand new, sync hasn't run since
// it was added) - same "never silently show nothing when a live answer
// exists" convention already used elsewhere in this file.
export async function fetchStoreSkuListFast(
  clientScope: string,
  storeName: string,
  knownClient?: string
): Promise<{ resolvedClient: string; rows: StoreSkuRow[] }> {
  const { db } = await import("./db");
  const { storeSkuWeekly, storeWeeklySummary } = await import("@shared/schema");
  const { sql } = await import("drizzle-orm");

  const normalizedStore = storeName.trim().toUpperCase();
  const clientFilter = clientScope === "SYNDICATED"
    ? sql`true`
    : sql`${storeSkuWeekly.client} = ${knownClient || clientScope}`;

  // Whether a sync attempt actually happened for this store/client this
  // week comes from storeWeeklySummary (real bug found 2026-08-13: checking
  // storeSkuWeekly's own presence conflated "never synced" with "synced,
  // genuinely zero SKU rows" - e.g. a client with no ranged SKUs at this
  // specific store - forcing a slow live fallback for a client that was
  // never going to have any rows anyway).
  const summaryClientFilter = clientScope === "SYNDICATED"
    ? sql`true`
    : sql`${storeWeeklySummary.client} = ${knownClient || clientScope}`;
  const attemptedRow = await db
    .select({ weekEnding: storeWeeklySummary.weekEnding })
    .from(storeWeeklySummary)
    .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${normalizedStore} and ${summaryClientFilter}`)
    .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`)
    .limit(1);

  if (attemptedRow.length === 0) {
    // Genuinely never synced for this store/client - fall back to live.
    return fetchStoreSkuList(clientScope, storeName, knownClient);
  }

  const latestWeek = attemptedRow[0].weekEnding;
  const rows = await db
    .select()
    .from(storeSkuWeekly)
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.weekEnding} = ${latestWeek} and ${clientFilter}`);

  // SYNDICATED with no explicit knownClient can legitimately match rows
  // from several real clients at once (same as the live scan's behavior
  // when scope is genuinely ambiguous) - resolvedClient reports whichever
  // client contributed the most rows, same "loudest" convention used live.
  const byClient = new Map<string, number>();
  for (const r of rows) byClient.set(r.client, (byClient.get(r.client) || 0) + 1);
  const resolvedClient = knownClient || (clientScope !== "SYNDICATED" ? clientScope : "") ||
    Array.from(byClient.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || clientScope;

  return {
    resolvedClient,
    rows: rows.map((r) => ({
      barcode: r.barcode,
      articleDescription: r.articleDescription || "",
      client: r.client,
      banner: r.banner,
      region: r.region,
      storeSoh: r.storeSoh ?? 0,
      dcSoh: r.dcSoh ?? 0,
      sellOutP4: r.sellOutP4 ?? 0,
      avgWeeklySales: r.avgWeeklySales,
      cover: r.cover,
      estimatedMissedUnits: r.estimatedMissedUnits ?? 0,
      suggestedOrderUnits: r.suggestedOrderUnits,
      dcFulfillableUnits: r.dcFulfillableUnits,
      issueDriver: r.issueDriver,
      consecutiveWeeksOOS: r.consecutiveWeeksOOS ?? 0,
      classification: r.classification || "Unknown",
      priority: r.priority,
      // Added 2026-08-16 so this one function can replace the live
      // fetchIssueDetailList for the main OOS/Low/Overstock list route too -
      // previously only "risk"/"cover"/"negsoh"/"distribution" used this
      // fast path, the most common classification lists still called Nexus
      // live on every request.
      sourceStem: r.sourceStem,
    })),
  };
}

export { AT_RISK_WFC_THRESHOLD_WEEKS };

interface DistributionGapsFile {
  storeView: Array<{ storeName: string; client: string; banner: string; missingSkus: number; categoriesAffected: number; avgCoverage: number }>;
  detailView: Array<{ storeName: string; banner: string; barcode: string; articleDescription: string; brand?: string; category?: string; gapType: string; missingStores: number; coveragePct: number; suggestedAction: string }>;
}

const distributionGapsFileCache: Map<string, CacheEntry<DistributionGapsFile>> = new Map();

// Real Distribution Gaps data for one store. The Nexus stem itself is
// network-wide (storeView/detailView capped at the top 1000 rows overall,
// not filterable server-side by &store=), so we fetch it once (cached) and
// filter client-side. A store legitimately returns 0 if it isn't severe
// enough to appear in Nexus's top-1000 slice - honest, not a bug.
export interface SkuWeekPoint {
  weekEnding: string;
  storeSoh: number | null;
  sellOutP4: number | null;
  cover: number | null;
}

// Real per-SKU history across up to the last 13 real weeks. There is no
// dedicated Nexus stem for this (store_sku_current is a current-week
// snapshot only) - so this makes one live call per week, filters for the
// one barcode, and returns whatever real weeks actually have that SKU
// ranged at this store. Slower than everything else in this file by
// design (13x calls) - only call this when a rep actually opens a single
// SKU's trend, never on a list page.
export async function fetchSkuHistory(
  clientScope: string,
  storeName: string,
  barcode: string,
  knownClient?: string
): Promise<{ resolvedClient: string; points: SkuWeekPoint[] }> {
  const index = await fetchNexusIndex();
  const client = knownClient || (clientScope !== "SYNDICATED" ? clientScope : undefined);
  if (!client) {
    return { resolvedClient: clientScope, points: [] };
  }
  const slug = nexusClientSlug(client);
  const weeks = [...index.weeks].sort(); // oldest first

  const points = await Promise.all(
    weeks.map(async (week): Promise<SkuWeekPoint | null> => {
      try {
        const result = await fetchNexusJson<{ rows: any[] }>(week, slug, "store_sku_current", { store: storeName });
        const row = (result.rows || []).find((r) => r.barcode === barcode);
        if (!row) return null;
        return {
          weekEnding: week,
          storeSoh: row.storeSOH ?? null,
          sellOutP4: row.sellOutP4Weeks ?? null,
          cover: typeof row.storeWFC === "number" ? row.storeWFC : null,
        };
      } catch {
        return null;
      }
    })
  );

  return {
    resolvedClient: client,
    points: points.filter((p): p is SkuWeekPoint => p !== null),
  };
}

// Fast local version - added 2026-08-16 after finding the live version above
// was still making 13 live Nexus calls per SKU, causing the SKU detail
// screen's "Building history..." trend to hang for a long time (the one
// piece from the original speed audit that never got migrated). Reads
// straight from store_sku_weekly, which already has up to 13 real weeks
// backfilled - same data, same real weeks, just local instead of live.
export async function fetchSkuHistoryFast(
  clientScope: string,
  storeName: string,
  barcode: string,
  knownClient?: string
): Promise<{ resolvedClient: string; points: SkuWeekPoint[] }> {
  const { db } = await import("./db");
  const { storeSkuWeekly } = await import("@shared/schema");
  const { sql } = await import("drizzle-orm");

  const normalizedStore = storeName.trim().toUpperCase();
  const client = knownClient || (clientScope !== "SYNDICATED" ? clientScope : undefined);
  if (!client) {
    return { resolvedClient: clientScope, points: [] };
  }

  const rows = await db
    .select()
    .from(storeSkuWeekly)
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.client} = ${client} and ${storeSkuWeekly.barcode} = ${barcode}`)
    .orderBy(sql`${storeSkuWeekly.weekEnding} ASC`);

  const points: SkuWeekPoint[] = rows.map((r) => ({
    weekEnding: r.weekEnding,
    storeSoh: r.storeSoh,
    sellOutP4: r.sellOutP4,
    cover: r.cover,
  }));

  return { resolvedClient: client, points };
}

export async function fetchDistributionGapsForStore(clientScope: string, storeName: string, knownClient?: string) {
  const index = await fetchNexusIndex();
  const client = knownClient || (clientScope !== "SYNDICATED" ? clientScope : undefined);
  if (!client) {
    return { missingSkus: 0, rows: [] as DistributionGapsFile["detailView"] };
  }
  const slug = nexusClientSlug(client);
  const cacheKey = `dg_${index.latest}_${slug}`;
  let file = distributionGapsFileCache.get(cacheKey)?.data;
  if (!file || (Date.now() - (distributionGapsFileCache.get(cacheKey)?.timestamp || 0)) >= NEXUS_CACHE_TTL_MS) {
    file = await fetchNexusJson<DistributionGapsFile>(index.latest, slug, "distribution_gaps");
    distributionGapsFileCache.set(cacheKey, { data: file, timestamp: Date.now() });
  }

  const normalizedStore = storeName.trim().toUpperCase();
  const storeRow = (file.storeView || []).find((r) => (r.storeName || "").trim().toUpperCase() === normalizedStore);
  const detailRows = (file.detailView || []).filter((r) => (r.storeName || "").trim().toUpperCase() === normalizedStore);

  return {
    missingSkus: storeRow?.missingSkus ?? detailRows.length,
    avgCoverage: storeRow?.avgCoverage ?? null,
    rows: detailRows,
  };
}

// Fast local version - added 2026-08-16, the last piece from the original
// speed audit still calling Nexus live. Reads straight from
// distribution_gaps, synced weekly the same as everything else.
export async function fetchDistributionGapsForStoreFast(clientScope: string, storeName: string, knownClient?: string) {
  const { db } = await import("./db");
  const { distributionGaps, storeWeeklySummary } = await import("@shared/schema");
  const { sql } = await import("drizzle-orm");

  const client = knownClient || (clientScope !== "SYNDICATED" ? clientScope : undefined);
  if (!client) {
    return { missingSkus: 0, avgCoverage: null as number | null, rows: [] as DistributionGapsFile["detailView"] };
  }
  const normalizedStore = storeName.trim().toUpperCase();

  const summaryRow = await db
    .select({ weekEnding: storeWeeklySummary.weekEnding })
    .from(storeWeeklySummary)
    .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${normalizedStore} and ${storeWeeklySummary.client} = ${client}`)
    .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`)
    .limit(1);
  if (summaryRow.length === 0) {
    // Genuinely never synced for this store/client - fall back to live.
    return fetchDistributionGapsForStore(clientScope, storeName, knownClient);
  }
  const latestWeek = summaryRow[0].weekEnding;

  const rows = await db
    .select()
    .from(distributionGaps)
    .where(sql`upper(trim(${distributionGaps.cleanedStoreName})) = ${normalizedStore} and ${distributionGaps.client} = ${client} and ${distributionGaps.weekEnding} = ${latestWeek}`);

  return {
    missingSkus: rows[0]?.missingSkusForStore ?? rows.length,
    avgCoverage: rows[0]?.avgCoverageForStore ?? null,
    rows: rows.map((r) => ({
      storeName: r.cleanedStoreName,
      banner: r.banner || "",
      barcode: r.barcode,
      articleDescription: r.articleDescription || "",
      brand: r.brand || undefined,
      category: r.category || undefined,
      gapType: r.gapType || "",
      missingStores: r.missingStores ?? 0,
      coveragePct: r.coveragePct ?? 0,
      suggestedAction: r.suggestedAction || "",
    })),
  };
}

/**
 * Fetch a Nexus dashboard-data JSON file for a given week/client/stem, with
 * an in-memory TTL cache. Throws a descriptive Error on any failure — never
 * lets a rejection escape unhandled. Callers (route handlers) should wrap
 * calls in try/catch and translate the Error into a clean JSON response.
 */
export async function fetchNexusJson<T>(
  week: string,
  clientSlug: string,
  stem: string,
  params?: Record<string, string>
): Promise<T> {
  const cacheKey = buildCacheKey(week, clientSlug, stem, params);
  const cached = nexusCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < NEXUS_CACHE_TTL_MS) {
    return cached.data as T;
  }

  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) {
    throw new Error('NEXUS_API_KEY is not configured — Nexus Inventory Insights cannot fetch data');
  }

  const url = new URL(
    `${NEXUS_BASE_URL}/api/dashboard-data/weeks/${encodeURIComponent(week)}/clients/${encodeURIComponent(clientSlug)}/${encodeURIComponent(stem)}.json`
  );
  url.searchParams.set('code', apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  let resp: Response;
  try {
    resp = await fetch(url.toString());
  } catch (err: any) {
    throw new Error(`Nexus request failed for ${stem} (week=${week}, client=${clientSlug}): ${err?.message || err}`);
  }

  if (!resp.ok) {
    let bodyText = '';
    try {
      bodyText = await resp.text();
    } catch {
      // ignore body-read failure
    }
    throw new Error(`Nexus returned ${resp.status} for ${stem} (week=${week}, client=${clientSlug}): ${bodyText}`);
  }

  let data: T;
  try {
    data = (await resp.json()) as T;
  } catch (err: any) {
    throw new Error(`Nexus returned invalid JSON for ${stem} (week=${week}, client=${clientSlug}): ${err?.message || err}`);
  }

  nexusCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

export function clearNexusCache(): void {
  nexusCache.clear();
}

// Confirmed live 2026-08-08 (real API call, not a guess): store_current's
// actual field names, for exactly one store, via the &store= filter Nexus's
// own dashboard already uses (avoids paging through the full unbounded
// result set just to find one store).
export interface NexusStoreCurrentRow {
  client: string;
  storeName: string;
  banner: string;
  oosCount: number;
  lowStockCount: number;
  overstockCount: number;
  noSalesCount: number;
  negSOHCount: number;
  healthScore: number;
}

export async function fetchStoreIssueCount(week: string, clientSlug: string, storeName: string): Promise<number> {
  const result = await fetchNexusJson<{ rows: NexusStoreCurrentRow[] }>(week, clientSlug, "store_current", { store: storeName });
  const rows = result.rows || [];
  return rows.reduce((sum, r) => sum + (r.oosCount || 0) + (r.lowStockCount || 0), 0);
}

// Real per-store issue count, sourced live from Nexus - no generated task
// data involved. A dedicated person's client is known, so this is one call
// per store; a syndicated person's real job is "every client at this
// store," so this checks every known client for each store (cached 5min,
// same TTL as everything else in this module - real but not free, hence
// the cache).
export async function fetchLiveIssueCounts(
  week: string,
  clientScope: string,
  storeNames: string[]
): Promise<Record<string, number>> {
  const clientsToCheck = clientScope === "SYNDICATED"
    ? Object.keys(NEXUS_CLIENT_SLUG_OVERRIDES)
    : [clientScope];

  const results: Record<string, number> = {};
  for (const store of storeNames) {
    let total = 0;
    await Promise.all(
      clientsToCheck.map(async (client) => {
        try {
          const slug = nexusClientSlug(client);
          const count = await fetchStoreIssueCount(week, slug, store);
          total += count;
        } catch {
          // A single client/store combo failing (e.g. that client has no
          // data for this store at all) shouldn't fail the whole request.
        }
      })
    );
    results[store] = total;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Response shape interfaces
//
// SHAPE UNVERIFIED — confirm against a live Nexus response once
// NEXUS_API_KEY is provisioned. These are best-effort guesses based on the
// field names implied by the feature spec (store overview, availability
// classification, low/overstock detail, per-SKU record).
// ---------------------------------------------------------------------------

// SHAPE UNVERIFIED — confirm against a live Nexus response once NEXUS_API_KEY is provisioned
export interface NexusStoreCurrentRecord {
  store: string;
  client: string;
  weekEnding: string;
  totalSkus: number;
  inStockPct: number;
  outOfStockCount: number;
  lowStockCount: number;
  overstockCount: number;
  noSalesStockPresentCount: number;
  optimalCount: number;
  actionQueue?: {
    total: number;
    orderableNow: number;
    toEscalate: number;
  };
  trend13Week?: Array<{ weekEnding: string; inStockPct: number }>;
  trend9Week?: Array<{ weekEnding: string; healthScore: number }>;
}

// SHAPE UNVERIFIED — confirm against a live Nexus response once NEXUS_API_KEY is provisioned
export interface NexusOosDetailRecord {
  barcode: string;
  articleDescription: string;
  store: string;
  client: string;
  classification: 'Out of stock' | 'Low stock' | 'No sales stock present' | 'Overstocked' | 'Optimal';
  unitsMissedPerWeek: number;
  dcStock: number;
  suggestedOrder: number;
  storeSoh: number;
  peerDistribution?: Array<{ store: string; soh: number }>;
  chronic?: boolean;
  dcHasStock?: boolean;
}

// SHAPE UNVERIFIED — confirm against a live Nexus response once NEXUS_API_KEY is provisioned
export interface NexusLowStockDetailRecord {
  barcode: string;
  articleDescription: string;
  store: string;
  client: string;
  weeksOfCover: number;
  storeSoh: number;
  unitsMissedPerWeek: number;
  dcStock: number;
  suggestedOrder: number;
}

// SHAPE UNVERIFIED — confirm against a live Nexus response once NEXUS_API_KEY is provisioned
export interface NexusOverstockDetailRecord {
  barcode: string;
  articleDescription: string;
  store: string;
  client: string;
  weeksOfCover: number;
  storeSoh: number;
  excessUnits: number;
}

// SHAPE UNVERIFIED — confirm against a live Nexus response once NEXUS_API_KEY is provisioned
export interface NexusStoreSkuCurrentRecord {
  barcode: string;
  articleDescription: string;
  store: string;
  client: string;
  classification: 'Out of stock' | 'Low stock' | 'No sales stock present' | 'Overstocked' | 'Optimal';
  storeSoh: number;
  dcStock: number;
  suggestedOrder: number;
  unitsSold13Week?: number[];
  storeSoh13Week?: number[];
  weekEndings13Week?: string[];
  peerDistribution?: Array<{ store: string; soh: number }>;
  rootCauseHint?: 'dc-no-stock' | 'dc-has-stock-not-ordered' | 'no-sales' | 'unknown';
}
