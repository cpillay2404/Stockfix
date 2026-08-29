// Weekly sync: pulls real store-level summary counts from Nexus into
// StockFix's own database, so live pages don't need to call Nexus at all
// for the common case (tiles, deltas, trend charts). Deliberately small -
// see storeWeeklySummary's comment in shared/schema.ts for why this is
// cheap (~340MB steady-state) while full SKU-level detail stays live-fetched
// on demand instead of being synced here.
import { db } from "./db";
import { storeWeeklySummary, storeSkuWeekly, distributionGaps, syncRuns, syncClientProgress } from "@shared/schema";
import { sql, eq, and } from "drizzle-orm";
import { fetchNexusJson, nexusClientSlug, type NexusStoreCurrentRow } from "./nexus";
import fs from "fs";
import path from "path";

// Plain-text heartbeat log so a stall is visible immediately (open the file
// directly, or GET /api/admin/sync-log) instead of needing a manual DB query
// to notice - added 2026-08-14 after repeated silent multi-hour stalls.
const SYNC_LOG_PATH = path.join(process.cwd(), "sync-progress.log");
function logSyncProgress(line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  console.log(`[sync] ${line}`);
  try {
    fs.appendFileSync(SYNC_LOG_PATH, stamped);
  } catch (err) {
    console.error("[sync-log] failed to write:", err);
  }
}

// Real bug found 2026-08-27 (Carin: "we cant keep retrying... cant we do
// the same as we did for resync" - i.e. small batches with resilience, not
// one giant all-or-nothing operation) - P&G's sync died 35 minutes in with
// "terminating connection due to administrator command" (Neon dropping a
// long-held connection), losing the whole client's sync even though writes
// were already batched 500 rows at a time. The batching alone didn't help
// because nothing retried a batch whose connection got dropped mid-write -
// one bad batch killed the entire client. This wraps a single batch write
// with a few retries on a fresh connection before giving up, so a dropped
// connection only costs one batch, not 35 minutes of real work.
// Real bug found 2026-08-27, live, mid-incident: the retry above still got
// stuck on attempt 1/4 for 3+ minutes with nothing happening - a dead TCP
// socket after 49 minutes of pure idle (no db.* calls at all during the
// fetch phase) doesn't always reject promptly, it can just hang waiting for
// a response that will never come. A retry loop is useless if a single
// attempt can hang forever. Racing each attempt against a hard timeout
// guarantees it fails fast and moves to a genuinely fresh connection
// instead of sitting stuck indefinitely.
const WRITE_ATTEMPT_TIMEOUT_MS = 20_000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function writeBatchWithRetry(fn: () => Promise<unknown>, label: string): Promise<void> {
  const MAX_ATTEMPTS = 4;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await withTimeout(fn(), WRITE_ATTEMPT_TIMEOUT_MS, label);
      return;
    } catch (err: any) {
      lastErr = err;
      logSyncProgress(`... ${label} write failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err?.message || err}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastErr;
}

const NEXUS_BASE_URL =
  process.env.NEXUS_BASE_URL ||
  "https://stockfix-validate-fdhkefdwc6dmejda.northeurope-01.azurewebsites.net";

// Davidoff removed 2026-08-18 (Carin: "should be out no longer receiving
// the data from this client") - the weekly sync must never touch it again,
// otherwise it keeps reappearing in store_weekly_summary indefinitely.
export const NEXUS_CLIENTS = [
  "AGROSERVE", "ALPEN", "ANCHOR YEAST", "AQUELLE", "ASPEN", "BUTTERFLY",
  "CAPE COOKIES", "DURACELL", "DYNAMIC BRANDS", "ETHICA",
  "LINDT", "MAGALIES", "P&G", "PENFLEX", "PMI", "SCJ", "SIR JUICE",
  "SODASTREAM", "SOILL", "STAEDTLER", "SWEET NOTHINGS", "TACOMA",
  "ULTRACHEM", "WILMAR",
];

// Reverted to 13 weeks 2026-08-14: the earlier 10-week trim was based on a
// wrong assumption of a 10 GiB database limit. The real production database
// (Replit's Neon-backed Postgres) is 100 GiB with ~2.25 GiB used - 13 weeks
// of store_sku_weekly (~704MB/week, ~9.2GB total) fits comfortably.
const RETAIN_WEEKS = 13;

// Real gap found 2026-08-20 (Carin: "im worried how this is going to work
// every week") - the manual trigger route used to await the whole sync
// inside one HTTP request, so every trigger was a single long-held
// connection the platform would eventually 504 regardless of whether the
// sync itself was fine - forcing a manual poll-and-wait cycle every time.
// This lets the route respond instantly and hand back status separately,
// via GET /api/admin/nexus-summary-sync/status, instead.
interface SyncJobStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastResult: SyncResult | null;
  lastError: string | null;
}

// Real incident found 2026-08-27/28 (traced properly, not guessed, via a
// pasted-in independent investigation): sync status used to live only in
// this process's memory. Replit Autoscale can replace an instance without
// the app crashing, and every Publish replaces the serving revision even
// mid-sync - both silently reset `running` to its default with no error,
// so the next check said "not running" while a client's data was actually
// half-synced, and there was no record of which clients had actually
// finished. Persisted here instead, so status survives a killed process
// and a resumed run can skip clients already done for the week rather than
// re-fetching everything (Carin, 2026-08-29: "we need to fix all bugs now").
const STALE_HEARTBEAT_MS = 15 * 60 * 1000;
let currentRunId: number | null = null;
let currentRunWeek: string | null = null;

export async function isSyncRunning(): Promise<boolean> {
  const [row] = await db.select().from(syncRuns).where(eq(syncRuns.status, "running"))
    .orderBy(sql`${syncRuns.id} desc`).limit(1);
  if (!row) return false;
  const staleMs = Date.now() - new Date(row.heartbeatAt).getTime();
  if (staleMs > STALE_HEARTBEAT_MS) {
    // The process that started this run is gone (killed by a Publish or an
    // Autoscale instance swap) - no heartbeat in 15 minutes means nothing is
    // actually still writing. Mark it dead so status stops lying and a new
    // run (which will resume via sync_client_progress) isn't blocked forever.
    await db.update(syncRuns).set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "No heartbeat for 15+ minutes - the process was almost certainly killed (Publish or instance replacement) mid-sync.",
    }).where(eq(syncRuns.id, row.id));
    return false;
  }
  return true;
}
export async function markSyncStarted(week: string): Promise<void> {
  const [row] = await db.insert(syncRuns).values({ week, status: "running" }).returning({ id: syncRuns.id });
  currentRunId = row.id;
  currentRunWeek = week;
}
export async function markSyncFinished(result: SyncResult | null, error?: string): Promise<void> {
  if (currentRunId == null) return;
  await db.update(syncRuns).set({
    status: error ? "failed" : "completed",
    finishedAt: new Date(),
    heartbeatAt: new Date(),
    errorMessage: error || null,
    rowsWritten: result?.rowsWritten ?? undefined,
    clientsSynced: result?.clientsSynced ?? undefined,
  }).where(eq(syncRuns.id, currentRunId));
  currentRunId = null;
  currentRunWeek = null;
}
async function heartbeat(): Promise<void> {
  if (currentRunId == null) return;
  await db.update(syncRuns).set({ heartbeatAt: new Date() }).where(eq(syncRuns.id, currentRunId));
}
async function markClientDone(week: string, client: string, rowsWritten: number): Promise<void> {
  await db.insert(syncClientProgress).values({ weekEnding: week, client, status: "done", rowsWritten })
    .onConflictDoUpdate({
      target: [syncClientProgress.weekEnding, syncClientProgress.client],
      set: { status: "done", rowsWritten, finishedAt: new Date() },
    });
}
export async function getSyncJobStatus(): Promise<SyncJobStatus> {
  const [row] = await db.select().from(syncRuns).orderBy(sql`${syncRuns.id} desc`).limit(1);
  if (!row) return { running: false, startedAt: null, finishedAt: null, lastResult: null, lastError: null };
  const running = row.status === "running" && (Date.now() - new Date(row.heartbeatAt).getTime()) <= STALE_HEARTBEAT_MS;
  return {
    running,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
    lastResult: row.status !== "running"
      ? { week: row.week, clientsSynced: row.clientsSynced || 0, rowsWritten: row.rowsWritten || 0, weeksPruned: 0, errors: row.errorMessage ? [row.errorMessage] : [] }
      : null,
    lastError: row.errorMessage,
  };
}

export async function fetchLatestWeek(): Promise<string> {
  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) throw new Error("NEXUS_API_KEY is not configured");
  const resp = await fetchWithTimeout(`${NEXUS_BASE_URL}/api/dashboard-data/index.json?code=${apiKey}`);
  if (!resp.ok) throw new Error(`Nexus index.json returned ${resp.status}`);
  const data = await resp.json();
  return data.latest;
}

// Real bug found 2026-08-13: plain fetch() has no default timeout, so a
// single slow/unresponsive Nexus response for one client could hang the
// entire weekly sync indefinitely (confirmed - a run stalled for 10+
// minutes on one client with zero progress). Every Nexus call in this file
// now aborts after FETCH_TIMEOUT_MS and the caller treats that like any
// other per-client error (caught, logged, loop moves on) - a stuck client
// no longer blocks every other client behind it.
const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Real bug found 2026-08-20 - a big client's per-SKU file can need 1000+
// pages (P&G: ~530k rows / 500 per page). One flaky page out of that many
// used to throw and lose every already-fetched page along with it,
// discarding an hour of real work back to zero rows (confirmed: P&G's
// week-2026-08-19 sync "succeeded" three times in a row with 0 sku rows,
// while a direct check against Nexus's own API proved the real data was
// there the whole time). Each page gets its own small retry budget, and a
// page that still fails after retries just stops the loop and keeps
// everything fetched before it, instead of throwing the whole result away.
//
// Also real, found the same day (Carin: "im worried how this is going to
// work every week") - fetching 1000+ pages one at a time was the actual
// reason P&G alone took 30-70 minutes every single run, forcing a manual
// wait-and-poll cycle each week. Pages are fetched CONCURRENCY at a time
// instead of strictly sequentially now - a full batch is awaited together,
// then walked in page order so the first 404/empty/failed page in that
// batch still stops the whole fetch at the right place (Nexus's pages are
// contiguous with no gaps, so out-of-order completion within one batch
// never mixes up the true stopping point).
const PAGE_FETCH_CONCURRENCY = 10;

async function fetchAllPages<T = any>(clientSlug: string, week: string, stem: string): Promise<T[]> {
  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) throw new Error("NEXUS_API_KEY is not configured");
  const rows: T[] = [];

  // Real bug found 2026-08-27 (Carin: P&G's 2026-08-26 sync landed only 933
  // of 1804 real stores, confirmed via direct dashboard.duckdb comparison -
  // every other client synced with a perfect 0% gap, only P&G, by far the
  // largest client with thousands of pages, was affected). `done` used to
  // mean two different things: "genuinely reached the end of real data" AND
  // "this page failed after every retry" - both returned done:true, so a
  // single transient failure on any page silently truncated ALL subsequent
  // pages as if the client's data had simply ended there. A huge client
  // fetching for 49 minutes is far more likely to hit one transient failure
  // than a small client that finishes in seconds - exactly why only P&G
  // was affected. `done` now means ONLY "genuinely empty/404 page"; a
  // retry-exhausted failure is a separate `failed` signal that does NOT
  // stop pagination - the loop skips past it and keeps fetching later
  // pages, and every failed page is collected so the caller can see exactly
  // what's missing instead of silently believing the sync succeeded in full.
  async function fetchPage(page: number): Promise<{ ok: boolean; done: boolean; failed: boolean; rows: T[] }> {
    const url = `${NEXUS_BASE_URL}/api/dashboard-data/weeks/${encodeURIComponent(week)}/clients/${encodeURIComponent(clientSlug)}/pages/${stem}/${String(page).padStart(5, "0")}.json?code=${apiKey}`;
    const MAX_PAGE_ATTEMPTS = 4;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt++) {
      try {
        const resp = await fetchWithTimeout(url);
        if (resp.status === 404) return { ok: true, done: true, failed: false, rows: [] };
        if (!resp.ok) {
          logSyncProgress(`... ${clientSlug} ${stem} page ${page} returned ${resp.status} (attempt ${attempt}/${MAX_PAGE_ATTEMPTS})`);
          lastErr = new Error(`HTTP ${resp.status}`);
          continue;
        }
        const data = await resp.json();
        const pageRows: T[] = data.rows || [];
        return { ok: true, done: pageRows.length === 0, failed: false, rows: pageRows };
      } catch (err: any) {
        lastErr = err;
      }
    }
    logSyncProgress(`... ${clientSlug} ${stem} page ${page} FAILED after ${MAX_PAGE_ATTEMPTS} attempts, skipping this page and continuing: ${lastErr?.message || lastErr}`);
    return { ok: false, done: false, failed: true, rows: [] };
  }

  const failedPages: number[] = [];
  let page = 0;
  let finished = false;
  while (!finished) {
    const batch = Array.from({ length: PAGE_FETCH_CONCURRENCY }, (_, i) => page + i);
    const results = await Promise.all(batch.map(fetchPage));
    for (const result of results) {
      if (result.failed) {
        failedPages.push(page);
        page++;
        continue;
      }
      if (result.done) {
        finished = true;
        break;
      }
      rows.push(...result.rows);
      page++;
    }
  }
  if (failedPages.length > 0) {
    logSyncProgress(`... ${clientSlug} ${stem} finished with ${failedPages.length} page(s) that failed after retries and were skipped: [${failedPages.join(", ")}] - data for those pages is missing from this sync, real gap not a silent truncation`);
  }
  return rows;
}

async function fetchAllStoreCurrentPages(clientSlug: string, week: string): Promise<NexusStoreCurrentRow[]> {
  return fetchAllPages<NexusStoreCurrentRow>(clientSlug, week, "store_current");
}

// Real per-store aggregates for the 3 KPI cards that had no historical
// column before 2026-08-12 (DC availability %, avg weeks of cover, sales
// at risk SKU count) - same formulas fetchStoreOverview already computes
// live per-store (nexus.ts:174-191), just aggregated across every store in
// one bulk pass here so the weekly summary table can persist them and
// "vs LW" deltas become real once 2+ weeks have been synced.
interface StoreIssueAgg { dcAvailable: number; oosRowCount: number; wfcSum: number; wfcCount: number; salesAtRisk: number }

// Fetched once per client per week and reused for both the store-level
// aggregates (StoreIssueAgg) and the per-SKU detail-field merge below -
// avoids fetching oos/low/overstock_detail twice.
async function fetchIssueDetailByClient(clientSlug: string, week: string) {
  const [oosRows, lowStockRows, overstockRows] = await Promise.all([
    fetchAllPages<any>(clientSlug, week, "oos_detail"),
    fetchAllPages<any>(clientSlug, week, "low_stock_detail"),
    fetchAllPages<any>(clientSlug, week, "overstock_detail"),
  ]);
  return { oosRows, lowStockRows, overstockRows };
}

function aggregateIssuesByStore(oosRows: any[], lowStockRows: any[]): Map<string, StoreIssueAgg> {
  const byStore = new Map<string, StoreIssueAgg>();
  const get = (storeName: string) => {
    let agg = byStore.get(storeName);
    if (!agg) {
      agg = { dcAvailable: 0, oosRowCount: 0, wfcSum: 0, wfcCount: 0, salesAtRisk: 0 };
      byStore.set(storeName, agg);
    }
    return agg;
  };

  for (const r of oosRows) {
    const agg = get(r.storeName);
    agg.oosRowCount++;
    if ((r.dcSOH || 0) > 0) agg.dcAvailable++;
    if ((r.estimatedMissedUnits || 0) > 0) agg.salesAtRisk++;
  }
  for (const r of lowStockRows) {
    const agg = get(r.storeName);
    if (typeof r.storeWFC === "number") {
      agg.wfcSum += r.storeWFC;
      agg.wfcCount++;
    }
  }
  return byStore;
}

const TARGET_COVER_WEEKS_SYNC = 4;

// Real per-SKU detail fields that only exist on the *_detail stems, keyed
// by storeName+barcode so they can be merged onto the full store_sku_current
// line list below. Same 4-week suggestedOrderUnits formula used live
// elsewhere (nexus.ts) for OOS rows that don't carry it natively.
function buildDetailFieldsByKey(oosRows: any[], lowStockRows: any[], overstockRows: any[]) {
  const map = new Map<string, { estimatedMissedUnits?: number; suggestedOrderUnits?: number; dcFulfillableUnits?: number; issueDriver?: string; priority?: string; consecutiveWeeksOOS?: number; classification?: string; sourceStem?: string }>();
  const key = (storeName: string, barcode: string) => `${storeName}::${barcode}`;

  for (const r of oosRows) {
    map.set(key(r.storeName, r.barcode), {
      estimatedMissedUnits: r.estimatedMissedUnits ?? undefined,
      suggestedOrderUnits: typeof r.avgWeeklySales === "number" ? Math.max(0, Math.round(TARGET_COVER_WEEKS_SYNC * r.avgWeeklySales)) : undefined,
      issueDriver: r.issueDriver ?? undefined,
      priority: r.priority ?? undefined,
      consecutiveWeeksOOS: r.consecutiveWeeksOOS ?? undefined,
      classification: "Out of Stock",
      sourceStem: "oos",
    });
  }
  for (const r of lowStockRows) {
    map.set(key(r.storeName, r.barcode), {
      estimatedMissedUnits: r.estimatedMissedUnits ?? undefined,
      suggestedOrderUnits: r.suggestedOrderUnits ?? undefined,
      dcFulfillableUnits: r.dcFulfillableUnits ?? undefined,
      priority: r.priority ?? undefined,
      classification: r.stockClassification || "Low Stock",
      sourceStem: "low",
    });
  }
  for (const r of overstockRows) {
    map.set(key(r.storeName, r.barcode), {
      classification: r.stockClassification || "Possible Overstock",
      sourceStem: "overstock",
    });
  }
  return map;
}

export interface SyncResult {
  week: string;
  clientsSynced: number;
  rowsWritten: number;
  weeksPruned: number;
  errors: string[];
}

export async function fetchNexusWeeks(): Promise<string[]> {
  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) throw new Error("NEXUS_API_KEY is not configured");
  const resp = await fetchWithTimeout(`${NEXUS_BASE_URL}/api/dashboard-data/index.json?code=${apiKey}`);
  if (!resp.ok) throw new Error(`Nexus index.json returned ${resp.status}`);
  const data = await resp.json();
  return data.weeks;
}

export async function runWeeklySummarySync(targetWeek?: string, onlyClients?: string[]): Promise<SyncResult> {
  const week = targetWeek || (await fetchLatestWeek());
  const errors: string[] = [];
  let rowsWritten = 0;
  let clientsSynced = 0;
  // Real transient network failures during the full per-SKU sync (a much
  // bigger pull than the old summary-only sync) shouldn't force re-fetching
  // every already-synced client just to retry the handful that failed -
  // Carin, 2026-08-13, hit exactly this after 5/25 clients errored out.
  const requestedList = onlyClients && onlyClients.length > 0
    ? NEXUS_CLIENTS.filter((c) => onlyClients.includes(c))
    : NEXUS_CLIENTS;

  // Resume support (Carin, 2026-08-29: "we need to fix all bugs now" - this
  // is the deferred fix for last week's chaos): an explicit ?clients= list
  // always re-runs exactly what was asked for (that's a deliberate gap-fill
  // request), but a full/default run skips clients already marked done for
  // this exact week in sync_client_progress, so a run that resumes after a
  // killed process picks up where it left off instead of re-fetching
  // clients (P&G alone took ~49 minutes) that already succeeded.
  let clientList = requestedList;
  if (!onlyClients || onlyClients.length === 0) {
    const doneRows = await db.select({ client: syncClientProgress.client })
      .from(syncClientProgress)
      .where(and(eq(syncClientProgress.weekEnding, week), eq(syncClientProgress.status, "done")));
    const doneSet = new Set(doneRows.map((r) => r.client));
    if (doneSet.size > 0) {
      clientList = requestedList.filter((c) => !doneSet.has(c));
      logSyncProgress(`RESUME week=${week} - skipping ${doneSet.size} already-done client(s): [${Array.from(doneSet).join(", ")}]`);
    }
  }

  logSyncProgress(`START week=${week} clients=${clientList.length} (${clientList.join(", ")})`);

  for (const client of clientList) {
    const slug = nexusClientSlug(client);
    const clientStartedAt = Date.now();
    logSyncProgress(`... ${client} starting`);
    await heartbeat();
    try {
      const [rows, skuRows, detail, distributionGapsFile] = await Promise.all([
        fetchAllStoreCurrentPages(slug, week),
        fetchAllPages<any>(slug, week, "store_sku_current").catch((err) => {
          errors.push(`${client} (store_sku_current): ${err?.message || err}`);
          return [] as any[];
        }),
        fetchIssueDetailByClient(slug, week).catch((err) => {
          errors.push(`${client} (issue detail): ${err?.message || err}`);
          return { oosRows: [] as any[], lowStockRows: [] as any[], overstockRows: [] as any[] };
        }),
        fetchNexusJson<{ storeView: any[]; detailView: any[] }>(week, slug, "distribution_gaps").catch((err) => {
          errors.push(`${client} (distribution_gaps): ${err?.message || err}`);
          return { storeView: [], detailView: [] };
        }),
      ]);
      if (rows.length === 0) continue;

      const issueAggByStore = aggregateIssuesByStore(detail.oosRows, detail.lowStockRows);
      const detailFieldsByKey = buildDetailFieldsByKey(detail.oosRows, detail.lowStockRows, detail.overstockRows);

      const summaryRows = rows.map((r: any) => {
        const agg = issueAggByStore.get(r.storeName);
        return {
          weekEnding: week,
          client,
          cleanedStoreName: r.storeName,
          banner: r.banner || null,
          region: r.region || null,
          siteCode: r.siteCode || null,
          totalSkus: r.totalSkus || 0,
          storeSoh: Math.round(r.storeSOH || 0),
          salesP4: Math.round(r.salesP4 || 0),
          oosCount: r.oosCount || 0,
          lowStockCount: r.lowStockCount || 0,
          overstockCount: r.overstockCount || 0,
          noSalesCount: r.noSalesCount || 0,
          dormantCount: r.dormantCount || 0,
          atRiskCount: 0, // filled in by a separate cross-reference pass, not yet built
          distributionGapsCount: 0, // filled in by a separate pass, not yet built
          healthScore: Math.round(r.healthScore || 0),
          dcAvailabilityPct: agg ? (agg.oosRowCount > 0 ? (agg.dcAvailable / agg.oosRowCount) * 100 : 100) : null,
          avgWeeksOfCover: agg && agg.wfcCount > 0 ? agg.wfcSum / agg.wfcCount : (agg ? 0 : null),
          salesAtRiskSkuCount: agg ? agg.salesAtRisk : null,
          negSohCount: r.negSOHCount ?? null,
        };
      });

      const BATCH = 500;
      for (let i = 0; i < summaryRows.length; i += BATCH) {
        const batch = summaryRows.slice(i, i + BATCH);
        await writeBatchWithRetry(() => db
          .insert(storeWeeklySummary)
          .values(batch)
          .onConflictDoUpdate({
            target: [storeWeeklySummary.weekEnding, storeWeeklySummary.client, storeWeeklySummary.cleanedStoreName],
            set: {
              banner: sql`excluded.banner`,
              region: sql`excluded.region`,
              siteCode: sql`excluded.site_code`,
              totalSkus: sql`excluded.total_skus`,
              storeSoh: sql`excluded.store_soh`,
              salesP4: sql`excluded.sales_p4`,
              oosCount: sql`excluded.oos_count`,
              lowStockCount: sql`excluded.low_stock_count`,
              overstockCount: sql`excluded.overstock_count`,
              noSalesCount: sql`excluded.no_sales_count`,
              dormantCount: sql`excluded.dormant_count`,
              healthScore: sql`excluded.health_score`,
              dcAvailabilityPct: sql`excluded.dc_availability_pct`,
              avgWeeksOfCover: sql`excluded.avg_weeks_of_cover`,
              salesAtRiskSkuCount: sql`excluded.sales_at_risk_sku_count`,
              negSohCount: sql`excluded.neg_soh_count`,
              syncedAt: new Date(),
            },
          }), `${client} storeWeeklySummary batch ${i}`);
        rowsWritten += batch.length;
      }

      // Dedupe by the same key the table's unique constraint uses - Nexus's
      // raw store_sku_current occasionally lists the same store+barcode
      // more than once (confirmed real for ALPEN/PMI/SOILL 2026-08-13:
      // Postgres rejects "ON CONFLICT DO UPDATE" affecting the same row
      // twice inside one INSERT statement). Last occurrence wins - keeps
      // the sync from failing outright for the whole client over a data
      // quality quirk, rather than silently dropping real rows elsewhere.
      const skuRowsByKey = new Map<string, any>();
      for (const r of skuRows) {
        skuRowsByKey.set(`${r.storeName}::${r.barcode}`, r);
      }
      const skuBatchRows = Array.from(skuRowsByKey.values()).map((r: any) => {
        const key = `${r.storeName}::${r.barcode}`;
        const extra = detailFieldsByKey.get(key);
        return {
          weekEnding: week,
          client,
          cleanedStoreName: r.storeName,
          barcode: r.barcode,
          articleDescription: r.articleDescription || null,
          banner: r.banner || null,
          region: r.region || null,
          siteCode: r.siteCode || null,
          storeSoh: r.storeSOH ?? null,
          dcSoh: r.dcSOH ?? null,
          sellOutP4: r.sellOutP4Weeks ?? null,
          avgWeeklySales: r.avgWeeklySales ?? null,
          cover: r.storeWFC ?? null,
          brand: r.brand ?? null,
          category: r.category ?? null,
          articleStatus: r.articleStatus ?? null,
          classification: extra?.classification || r.classification || null,
          estimatedMissedUnits: extra?.estimatedMissedUnits ?? null,
          suggestedOrderUnits: extra?.suggestedOrderUnits ?? null,
          dcFulfillableUnits: extra?.dcFulfillableUnits ?? null,
          issueDriver: extra?.issueDriver ?? null,
          priority: extra?.priority ?? null,
          consecutiveWeeksOOS: extra?.consecutiveWeeksOOS ?? null,
          sourceStem: extra?.sourceStem ?? null,
        };
      });
      for (let i = 0; i < skuBatchRows.length; i += BATCH) {
        const batch = skuBatchRows.slice(i, i + BATCH);
        await writeBatchWithRetry(() => db
          .insert(storeSkuWeekly)
          .values(batch)
          .onConflictDoUpdate({
            target: [storeSkuWeekly.weekEnding, storeSkuWeekly.client, storeSkuWeekly.cleanedStoreName, storeSkuWeekly.barcode],
            set: {
              articleDescription: sql`excluded.article_description`,
              banner: sql`excluded.banner`,
              region: sql`excluded.region`,
              siteCode: sql`excluded.site_code`,
              storeSoh: sql`excluded.store_soh`,
              dcSoh: sql`excluded.dc_soh`,
              sellOutP4: sql`excluded.sell_out_p4`,
              avgWeeklySales: sql`excluded.avg_weekly_sales`,
              cover: sql`excluded.cover`,
              brand: sql`excluded.brand`,
              category: sql`excluded.category`,
              articleStatus: sql`excluded.article_status`,
              classification: sql`excluded.classification`,
              estimatedMissedUnits: sql`excluded.estimated_missed_units`,
              suggestedOrderUnits: sql`excluded.suggested_order_units`,
              dcFulfillableUnits: sql`excluded.dc_fulfillable_units`,
              issueDriver: sql`excluded.issue_driver`,
              priority: sql`excluded.priority`,
              consecutiveWeeksOOS: sql`excluded.consecutive_weeks_oos`,
              sourceStem: sql`excluded.source_stem`,
              syncedAt: new Date(),
            },
          }), `${client} storeSkuWeekly batch ${i}`);
        rowsWritten += batch.length;
      }

      // Distribution Gaps - small, bounded file (network-wide, not per-
      // store), synced 2026-08-16 as the last piece from the original speed
      // audit that still called Nexus live. Store-level aggregates from
      // storeView get denormalized onto each matching detail row.
      const storeViewByStore = new Map<string, { missingSkus: number; avgCoverage: number }>();
      for (const sv of distributionGapsFile.storeView || []) {
        storeViewByStore.set(String(sv.storeName || "").trim().toUpperCase(), {
          missingSkus: sv.missingSkus,
          avgCoverage: sv.avgCoverage,
        });
      }
      const gapsRows = (distributionGapsFile.detailView || []).map((r: any) => {
        const sv = storeViewByStore.get(String(r.storeName || "").trim().toUpperCase());
        return {
          weekEnding: week,
          client,
          cleanedStoreName: r.storeName,
          banner: r.banner || null,
          barcode: r.barcode,
          articleDescription: r.articleDescription || null,
          brand: r.brand || null,
          category: r.category || null,
          gapType: r.gapType || null,
          missingStores: r.missingStores ?? null,
          coveragePct: r.coveragePct ?? null,
          suggestedAction: r.suggestedAction || null,
          missingSkusForStore: sv?.missingSkus ?? null,
          avgCoverageForStore: sv?.avgCoverage ?? null,
        };
      });
      // Full replace per client+week rather than upsert - detailView isn't
      // keyed by a stable natural id from Nexus, and the whole file is
      // small enough that a delete+insert is simpler than reconciling diffs.
      // Real gap found 2026-08-29 (deferred fix from the "atomic writes"
      // item flagged in the 2026-08-27/28 incident investigation): a
      // delete-then-insert that isn't wrapped in one transaction leaves this
      // client's gaps genuinely empty (not stale, GONE) if the process dies
      // between the delete and the inserts finishing - a real risk given how
      // often a Publish or instance swap has killed a sync mid-run. Wrapped
      // in a transaction so either the full replace happens or none of it
      // does - the old rows survive if the new write can't complete.
      await db.transaction(async (tx) => {
        await tx.delete(distributionGaps).where(sql`week_ending = ${week} and client = ${client}`);
        for (let i = 0; i < gapsRows.length; i += BATCH) {
          await tx.insert(distributionGaps).values(gapsRows.slice(i, i + BATCH));
        }
      });
      rowsWritten += gapsRows.length;

      await markClientDone(week, client, rows.length + skuRows.length + gapsRows.length);
      clientsSynced++;
      const secs = ((Date.now() - clientStartedAt) / 1000).toFixed(1);
      logSyncProgress(`OK  ${client} done in ${secs}s (${rows.length} stores, ${skuRows.length} skus, ${gapsRows.length} gaps)`);
    } catch (err: any) {
      const secs = ((Date.now() - clientStartedAt) / 1000).toFixed(1);
      logSyncProgress(`ERR ${client} failed after ${secs}s: ${err?.message || err}`);
      errors.push(`${client}: ${err?.message || err}`);
    }
  }

  logSyncProgress(`FINISHED week=${week} clientsSynced=${clientsSynced}/${clientList.length} rowsWritten=${rowsWritten} errors=${errors.length}`);

  // Prune anything older than the retention window - keeps this table
  // permanently small (~340MB steady-state) instead of growing forever.
  // Wrapped in try/catch 2026-08-14: a transient DNS/network blip here used
  // to throw uncaught and crash the entire multi-week backfill request,
  // silently abandoning every week after the one in progress. A failed
  // prune this run just means it's retried next run - not worth losing
  // the rest of the backfill over.
  let weeksPruned = 0;
  try {
    const distinctWeeks = await db
      .selectDistinct({ weekEnding: storeWeeklySummary.weekEnding })
      .from(storeWeeklySummary);
    const sortedWeeks = distinctWeeks.map((w) => w.weekEnding).sort().reverse();
    const weeksToPrune = sortedWeeks.slice(RETAIN_WEEKS);
    for (const oldWeek of weeksToPrune) {
      await db.delete(storeWeeklySummary).where(sql`${storeWeeklySummary.weekEnding} = ${oldWeek}`);
      // storeSkuWeekly is much bigger (full per-SKU line list vs one summary
      // row per store) - same 13-week retention window, pruned alongside the
      // same weeks so the two tables never drift out of sync.
      await db.delete(storeSkuWeekly).where(sql`${storeSkuWeekly.weekEnding} = ${oldWeek}`);
      await db.delete(distributionGaps).where(sql`${distributionGaps.weekEnding} = ${oldWeek}`);
      weeksPruned++;
    }
  } catch (err: any) {
    logSyncProgress(`ERR retention prune failed (will retry next run): ${err?.message || err}`);
    errors.push(`retention prune: ${err?.message || err}`);
  }

  return { week, clientsSynced, rowsWritten, weeksPruned, errors };
}

// Lightweight, gaps-only sync - added 2026-08-17 after a real mistake: the
// full runWeeklySummarySync backfill got re-triggered to pick up newly-added
// Distribution Gaps support, which meant redundantly re-fetching the entire
// (already-synced, much bigger) SKU/store_current dataset for every client
// just to get this one small file too. Distribution Gaps is its own small,
// bounded file per client (max 1000 rows network-wide) - this syncs ONLY
// that, for every already-synced week, in a fraction of the time.
export async function runDistributionGapsOnlySync(weeks: string[]): Promise<{ weeksSynced: number; rowsWritten: number; errors: string[] }> {
  const errors: string[] = [];
  let rowsWritten = 0;
  let weeksSynced = 0;

  for (const week of weeks) {
    logSyncProgress(`START (gaps-only) week=${week} clients=${NEXUS_CLIENTS.length}`);
    for (const client of NEXUS_CLIENTS) {
      const slug = nexusClientSlug(client);
      const clientStartedAt = Date.now();
      try {
        const file = await fetchNexusJson<{ storeView: any[]; detailView: any[] }>(week, slug, "distribution_gaps");
        const storeViewByStore = new Map<string, { missingSkus: number; avgCoverage: number }>();
        for (const sv of file.storeView || []) {
          storeViewByStore.set(String(sv.storeName || "").trim().toUpperCase(), {
            missingSkus: sv.missingSkus,
            avgCoverage: sv.avgCoverage,
          });
        }
        const gapsRows = (file.detailView || []).map((r: any) => {
          const sv = storeViewByStore.get(String(r.storeName || "").trim().toUpperCase());
          return {
            weekEnding: week,
            client,
            cleanedStoreName: r.storeName,
            banner: r.banner || null,
            barcode: r.barcode,
            articleDescription: r.articleDescription || null,
            brand: r.brand || null,
            category: r.category || null,
            gapType: r.gapType || null,
            missingStores: r.missingStores ?? null,
            coveragePct: r.coveragePct ?? null,
            suggestedAction: r.suggestedAction || null,
            missingSkusForStore: sv?.missingSkus ?? null,
            avgCoverageForStore: sv?.avgCoverage ?? null,
          };
        });
        await db.delete(distributionGaps).where(sql`week_ending = ${week} and client = ${client}`);
        const BATCH = 500;
        for (let i = 0; i < gapsRows.length; i += BATCH) {
          await db.insert(distributionGaps).values(gapsRows.slice(i, i + BATCH));
          rowsWritten += Math.min(BATCH, gapsRows.length - i);
        }
        const secs = ((Date.now() - clientStartedAt) / 1000).toFixed(1);
        logSyncProgress(`OK  (gaps-only) ${client} ${week} done in ${secs}s (${gapsRows.length} gaps)`);
      } catch (err: any) {
        const secs = ((Date.now() - clientStartedAt) / 1000).toFixed(1);
        logSyncProgress(`ERR (gaps-only) ${client} ${week} failed after ${secs}s: ${err?.message || err}`);
        errors.push(`${client} ${week}: ${err?.message || err}`);
      }
    }
    weeksSynced++;
  }

  return { weeksSynced, rowsWritten, errors };
}
