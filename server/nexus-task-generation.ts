// Auto-generates rep tasks from the freshly-synced Nexus data, instead of
// tasks being populated manually. Added 2026-08-16 as part of the automatic
// weekly cycle (see nexus-weekly-scheduler.ts): export outgoing week -> sync
// new week -> generate new tasks (this file) -> wipe outgoing week.
//
// Writes to `nexus_tasks`, a SEPARATE table from the real, live-production
// `tasks` table (Carin, 2026-08-17: "create a brand new table ... and not
// touch the current table where the tasks are saved" - this whole feature
// is being tested against the same real Neon database the live app already
// serves the classic Tasks screen from, so isolating it here means testing/
// generated rows can never mix into that table's completion reporting).
import { db } from "./db";
import { storeSkuWeekly, storeAssignments, resourceRoster, nexusTasks, nexusTaskAssignees, distributionGaps, clientOverstockRules, type InsertNexusTask } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { AT_RISK_WFC_THRESHOLD_WEEKS } from "./nexus";

// Design decisions (revised 2026-08-17, see project_stockfix_flag_vs_task_decision
// memory for the related "flag counts as done" decision):
//   - ONE TASK PER FLAGGED SKU, matching the real legacy model (the weekly
//     Excel-upload pipeline in process_stockfix.py has always produced one
//     row per flagged SKU per store - "tasksAssigned" is a straight count of
//     those rows, not a rolled-up issue-type count). An earlier version of
//     this file rolled up to a single worst-SKU-per-issue-type task - that
//     was a wrong assumption that didn't match the established model and
//     has been corrected (confirmed it never ran against real data: zero
//     NEXUS_-prefixed rows existed in the live tasks table).
//   - Covers all 6 issue types the Insights/Fix screens show: oos, low
//     (real flagged rows, estimated_missed_units>0), risk (same
//     storeSoh>0 && cover<=AT_RISK_WFC_THRESHOLD_WEEKS threshold as
//     nexus.ts's computeAtRiskRows), negsoh (storeSoh<0, matching routes.ts's
//     "negsoh" classification exactly), and distribution (every synced
//     distribution_gaps row for the week - matches what routes.ts already
//     shows unfiltered on the Fix/Insights distribution-gap list).
//   - Overstock is the one exception to "one task per flagged SKU": real
//     network-wide volume (619,932 flagged rows one week) made per-SKU
//     tasks unfair to ask a rep to work through (Carin, 2026-08-17). Only
//     SKUs at least 3x the real 6-week overstock threshold (cover >= 18)
//     qualify, capped to the worst 5 per store by cover. Every overstocked
//     SKU still shows normally on the Overstock screen regardless - only
//     task generation is capped, not visibility or the ability to tap Fix
//     on any of them (a tap on one that didn't make the cut just won't
//     resolve to a task, same as any SKU with no active issue this week).
//   - repName/lineManager assignment comes from the real Call Cycle Master
//     data (imported 2026-08-16 into storeAssignments/resourceRoster from
//     "Call Cycle master - Stock Fix.xlsx"), NOT from guessing off old task
//     history (an earlier, wrong attempt - see git history on this file).
//   - A store can have more than one person covering it (confirmed real in
//     the Call Cycle Master - e.g. a syndicated merchandiser AND a
//     syndicated rep on the same store). Rather than creating one task per
//     assigned person (which would inflate every open-task count), this
//     creates ONE task, leaves repName = "Unassigned" until someone actually
//     captures it, and lists everyone eligible as one row each in the
//     separate nexus_task_assignees table (not a comma-separated cell -
//     Carin, 2026-08-17: "that's a problem for me" for reporting/joins).
//     IMPORTANT for reporting: joining nexus_tasks to nexus_task_assignees
//     multiplies rows for any store with 2+ eligible people - always
//     COUNT(DISTINCT unique_id), never COUNT(*), after that join (Carin's
//     own catch, 2026-08-17). Whoever captures it first gets credited via a
//     separate completion endpoint (see routes.ts) - the existing rep-
//     facing PATCH /api/tasks/:uniqueId is NOT touched, since the live app
//     depends on it as-is.
//   - P&G has its own dedicated coverage (clientScope='P&G' in
//     storeAssignments) that overrides the general SYNDICATED coverage for
//     P&G's own stock specifically. Every other client uses SYNDICATED.
//   - uniqueId is deterministic (week+client+store+sourceStem) so re-running
//     this for the same week is naturally a no-op via onConflictDoNothing -
//     no separate "already generated" check needed.
//   - KNOWN LIMITATION: store-name matching between Nexus's cleaned_store_name
//     and the Call Cycle Master's store names is a simple exact match
//     (uppercase+trim) for now. The Call Cycle Master file itself has
//     "Store Name Match Review"/"CCM vs Store Mapper Review" sheets proving
//     these names don't always match exactly - a real fuzzy-matching pass
//     (like those review sheets already do) would catch more stores. Not
//     done tonight given time - stores that don't exact-match will show as
//     storesWithNoAssignment, same as a genuine gap.
async function buildStoreCoverageMap(): Promise<Map<string, { empId: string; resourceName: string; clientScope: string }[]>> {
  const rows = await db.select().from(storeAssignments);
  const map = new Map<string, { empId: string; resourceName: string; clientScope: string }[]>();
  for (const r of rows) {
    const key = String(r.cleanedStoreName).toUpperCase().trim();
    const list = map.get(key) || [];
    list.push({ empId: r.resourceEmpId, resourceName: r.resourceName, clientScope: r.clientScope });
    map.set(key, list);
  }
  return map;
}

function resolveAssignees(
  coverage: Map<string, { empId: string; resourceName: string; clientScope: string }[]>,
  storeName: string,
  client: string
): { empId: string; resourceName: string }[] {
  const entries = coverage.get(String(storeName).toUpperCase().trim()) || [];
  if (client === "P&G") {
    const dedicated = entries.filter((e) => e.clientScope === "P&G");
    if (dedicated.length > 0) return dedicated;
  }
  return entries.filter((e) => e.clientScope === "SYNDICATED");
}

// Real, uncapped Overstock count for one store - queries store_sku_weekly
// directly against the same per-client "no sales in N days" checkpoint
// logic generateTasksForWeek uses, but never gated by whether a task/
// assignee could actually be created for it (Carin, 2026-08-18: KPI cards
// must always show the FULL real number - nexus_tasks itself silently
// drops any SKU at a store with no call-cycle coverage via pushRow's
// `if (assignees.length === 0) return`, so counting rows in nexus_tasks
// undercounts every store with a call-cycle gap; this is the fix).
// A client with no row in client_overstock_rules is excluded entirely
// (never assumed a default threshold), matching Davidoff's real removal.
// Real row list backing both the badge and the drill-down list - both must
// show the exact same SKUs (Carin, 2026-08-18: "if I click it and see the
// full [list], what happens?" - a badge and a list built from two different
// sources can silently disagree; this is the single source of truth for
// Overstock everywhere in the app).
export async function listRealOverstockAtStore(store: string, week: string, clientFilter?: string): Promise<any[]> {
  const overstockRules = await db.select().from(clientOverstockRules);
  const weeksNeededByClient = new Map<string, number>();
  const thresholdByClient = new Map<string, number>();
  for (const r of overstockRules) {
    if (clientFilter && clientFilter !== "ALL" && clientFilter !== "SYNDICATED" && r.client !== clientFilter) continue;
    weeksNeededByClient.set(r.client, Math.max(1, Math.ceil(r.noSalesDaysThreshold / 28)));
    thresholdByClient.set(r.client, r.noSalesDaysThreshold);
  }
  if (weeksNeededByClient.size === 0) return [];

  const clientsByWeeksNeeded = new Map<number, string[]>();
  for (const [client, weeksNeeded] of Array.from(weeksNeededByClient.entries())) {
    const list = clientsByWeeksNeeded.get(weeksNeeded) || [];
    list.push(client);
    clientsByWeeksNeeded.set(weeksNeeded, list);
  }

  const allRows: any[] = [];
  for (const [weeksNeeded, clients] of Array.from(clientsByWeeksNeeded.entries())) {
    const checkpointExists = Array.from({ length: weeksNeeded }, (_, k) => sql`
      exists (
        select 1 from store_sku_weekly chk
        where chk.client = curr.client
          and chk.cleaned_store_name = curr.cleaned_store_name
          and chk.barcode = curr.barcode
          and chk.week_ending = (${week}::date - (${k * 4} || ' weeks')::interval)::date::text
          and coalesce(chk.sell_out_p4, 0) = 0
      )
    `);
    const result = await db.execute(sql`
      select curr.client, curr.cleaned_store_name, curr.barcode, curr.article_description,
        curr.category, curr.classification, curr.store_soh, curr.dc_soh, curr.sell_out_p4, curr.cover
      from store_sku_weekly curr
      where curr.week_ending = ${week}
        and lower(trim(curr.cleaned_store_name)) = lower(trim(${store}))
        and curr.client in (${sql.join(clients.map((c: string) => sql`${c}`), sql`, `)})
        and curr.store_soh > 0
        and ${sql.join(checkpointExists, sql` and `)}
      order by curr.store_soh desc
    `);
    const rows = (result.rows || result) as any[];
    for (const r of rows) {
      allRows.push({ ...r, days_threshold: thresholdByClient.get(r.client) ?? null });
    }
  }
  return allRows;
}

export async function countRealOverstockAtStore(store: string, week: string, clientFilter?: string): Promise<number> {
  const rows = await listRealOverstockAtStore(store, week, clientFilter);
  return rows.length;
}

export async function generateTasksForWeek(week: string): Promise<{ tasksCreated: number; storesWithNoAssignment: number }> {
  const flaggedIssue = await db.execute(sql`
    select client, cleaned_store_name, banner, region, barcode,
      article_description, category, classification, source_stem,
      store_soh, dc_soh, sell_out_p4, cover, estimated_missed_units, issue_driver
    from store_sku_weekly
    where week_ending = ${week}
      and source_stem in ('oos', 'low')
      and estimated_missed_units > 0
  `);

  // Overstock is now judged per-client, not by one blanket Nexus label
  // (Carin, 2026-08-18: real network-wide data showed a flat 6-week cover
  // rule flagged 74% of everything, with client-level variance 13.7%-77.4%
  // far wider than category variance 35%-60% - proof a single client's
  // real order cadence, not a universal number, decides what "genuinely
  // stuck" means). client_overstock_rules holds Carin's real per-client
  // "no sales in N days" definition, collected one client at a time.
  // sellOutP4 is a rolling 4-week (28-day) total, the finest grain Nexus
  // gives us - N days converts to ceil(N/28) checkpoints spaced 4 weeks
  // apart (current week, -4wk, -8wk, ...), ALL of which must show
  // sellOutP4=0 to qualify. A checkpoint week with no synced row at all
  // means we can't prove that far back, so it's excluded, not assumed -
  // this is an honest approximation of the real 28-day-window data we
  // actually have, not exact daily tracking (Nexus doesn't provide that).
  const overstockRules = await db.select().from(clientOverstockRules);
  const weeksNeededByClient = new Map<string, number>();
  for (const r of overstockRules) {
    weeksNeededByClient.set(r.client, Math.max(1, Math.ceil(r.noSalesDaysThreshold / 28)));
  }
  const clientsByWeeksNeeded = new Map<number, string[]>();
  for (const [client, weeksNeeded] of Array.from(weeksNeededByClient.entries())) {
    const list = clientsByWeeksNeeded.get(weeksNeeded) || [];
    list.push(client);
    clientsByWeeksNeeded.set(weeksNeeded, list);
  }

  const flaggedOverstock: any[] = [];
  for (const [weeksNeeded, clients] of Array.from(clientsByWeeksNeeded.entries())) {
    const checkpointExists = Array.from({ length: weeksNeeded }, (_, k) => sql`
      exists (
        select 1 from store_sku_weekly chk
        where chk.client = curr.client
          and chk.cleaned_store_name = curr.cleaned_store_name
          and chk.barcode = curr.barcode
          and chk.week_ending = (${week}::date - (${k * 4} || ' weeks')::interval)::date::text
          and coalesce(chk.sell_out_p4, 0) = 0
      )
    `);
    const rows = await db.execute(sql`
      select curr.client, curr.cleaned_store_name, curr.banner, curr.region, curr.barcode,
        curr.article_description, curr.category, curr.classification,
        curr.store_soh, curr.dc_soh, curr.sell_out_p4, curr.cover
      from store_sku_weekly curr
      where curr.week_ending = ${week}
        and curr.client in (${sql.join(clients.map((c: string) => sql`${c}`), sql`, `)})
        and curr.store_soh > 0
        and ${sql.join(checkpointExists, sql` and `)}
    `);
    flaggedOverstock.push(...((rows.rows || rows) as any[]));
  }

  const flaggedAtRisk = await db.execute(sql`
    select client, cleaned_store_name, banner, region, barcode,
      article_description, category, classification,
      store_soh, dc_soh, sell_out_p4, cover
    from store_sku_weekly
    where week_ending = ${week}
      and store_soh > 0
      and cover is not null
      and cover <= ${AT_RISK_WFC_THRESHOLD_WEEKS}
  `);

  const flaggedNegSoh = await db.execute(sql`
    select client, cleaned_store_name, banner, region, barcode,
      article_description, category, classification,
      store_soh, dc_soh, sell_out_p4, cover
    from store_sku_weekly
    where week_ending = ${week}
      and store_soh < 0
  `);

  const flaggedGaps = await db.select().from(distributionGaps).where(eq(distributionGaps.weekEnding, week));

  const coverage = await buildStoreCoverageMap();
  const insertRows: InsertNexusTask[] = [];
  const assigneeRows: { taskUniqueId: string; resourceEmpId: string; resourceName: string }[] = [];
  const noAssignmentStores = new Set<string>();

  function pushRow(sourceStem: string, opts: {
    client: string; storeName: string; banner?: string | null; region?: string | null;
    barcode: string; articleDescription?: string | null; category?: string | null;
    dcSoh?: unknown; storeSoh?: unknown; sellOutP4?: unknown; cover?: unknown;
    classification?: string | null; missedUnits?: number | null;
  }, actionText: string) {
    const assignees = resolveAssignees(coverage, opts.storeName, opts.client);
    if (assignees.length === 0) {
      noAssignmentStores.add(`${opts.client}_${opts.storeName}`); // real call-cycle gap, not guessed at
      return;
    }

    const uniqueId = `NEXUS_${week}_${opts.client}_${opts.storeName}_${sourceStem}_${opts.barcode}`.replace(/\s+/g, "_");

    for (const a of assignees) {
      assigneeRows.push({ taskUniqueId: uniqueId, resourceEmpId: a.empId, resourceName: a.resourceName });
    }

    insertRows.push({
      uniqueId,
      key: uniqueId,
      client: opts.client,
      banner: opts.banner || "",
      region: opts.region || "",
      storeName: opts.storeName,
      repName: "Unassigned", // set for real by the completion endpoint once someone captures it
      lineManager: "",
      category: opts.category || "",
      barcode: opts.barcode,
      articleDescription: opts.articleDescription || "",
      dcSoh: String(opts.dcSoh ?? ""),
      storeSoh: String(opts.storeSoh ?? ""),
      p4WeekSales: String(opts.sellOutP4 ?? ""),
      missedSales: String(opts.missedUnits ?? 0),
      storeWfc: String(opts.cover ?? ""),
      stockClassification: opts.classification || "",
      weekEnding: week,
      weekEndingDate: week,
      action: actionText,
      actionStatus: "Pending",
    });
  }

  for (const r of (flaggedIssue.rows || flaggedIssue) as any[]) {
    const actionText = r.issue_driver === "DC Constraint"
      ? `${r.classification} - DC has no stock (supply constraint). Escalate the order, this isn't fixable on-shelf.`
      : `${r.classification} - review stock levels, ${Math.round(r.estimated_missed_units)} units/week at risk.`;
    pushRow(r.source_stem, {
      client: r.client, storeName: r.cleaned_store_name, banner: r.banner, region: r.region,
      barcode: r.barcode, articleDescription: r.article_description, category: r.category,
      dcSoh: r.dc_soh, storeSoh: r.store_soh, sellOutP4: r.sell_out_p4, cover: r.cover,
      classification: r.classification, missedUnits: r.estimated_missed_units,
    }, actionText);
  }

  for (const r of flaggedOverstock) {
    const daysThreshold = weeksNeededByClient.has(r.client) ? overstockRules.find((rule) => rule.client === r.client)?.noSalesDaysThreshold : null;
    const actionText = `${r.classification || "Possible Overstock"} - no sales in ${daysThreshold ?? "60+"} days, ${Number(r.cover ?? 0).toFixed(1)} weeks cover. Review for markdown / transfer.`;
    pushRow("overstock", {
      client: r.client, storeName: r.cleaned_store_name, banner: r.banner, region: r.region,
      barcode: r.barcode, articleDescription: r.article_description, category: r.category,
      dcSoh: r.dc_soh, storeSoh: r.store_soh, sellOutP4: r.sell_out_p4, cover: r.cover,
      classification: r.classification || "Possible Overstock",
    }, actionText);
  }

  for (const r of (flaggedAtRisk.rows || flaggedAtRisk) as any[]) {
    const actionText = `At Risk - ${Number(r.cover).toFixed(1)} weeks cover, replenish before it becomes Out of Stock.`;
    pushRow("risk", {
      client: r.client, storeName: r.cleaned_store_name, banner: r.banner, region: r.region,
      barcode: r.barcode, articleDescription: r.article_description, category: r.category,
      dcSoh: r.dc_soh, storeSoh: r.store_soh, sellOutP4: r.sell_out_p4, cover: r.cover,
      classification: r.classification || "At Risk",
    }, actionText);
  }

  for (const r of (flaggedNegSoh.rows || flaggedNegSoh) as any[]) {
    const actionText = "Negative SOH - investigate stock count discrepancy.";
    pushRow("negsoh", {
      client: r.client, storeName: r.cleaned_store_name, banner: r.banner, region: r.region,
      barcode: r.barcode, articleDescription: r.article_description, category: r.category,
      dcSoh: r.dc_soh, storeSoh: r.store_soh, sellOutP4: r.sell_out_p4, cover: r.cover,
      classification: "Negative SOH",
    }, actionText);
  }

  for (const r of flaggedGaps) {
    const actionText = r.suggestedAction || "Distribution gap - review ranging for this store.";
    pushRow("distribution", {
      client: r.client, storeName: r.cleanedStoreName, banner: r.banner, region: null,
      barcode: r.barcode, articleDescription: r.articleDescription, category: r.category,
      storeSoh: 0, classification: r.gapType || "Distribution Gap",
    }, actionText);
  }

  const BATCH = 500;
  let tasksCreated = 0;
  for (let i = 0; i < insertRows.length; i += BATCH) {
    const created = await db.insert(nexusTasks).values(insertRows.slice(i, i + BATCH)).onConflictDoNothing().returning();
    tasksCreated += created.length;
  }
  for (let i = 0; i < assigneeRows.length; i += BATCH) {
    await db.insert(nexusTaskAssignees).values(assigneeRows.slice(i, i + BATCH)).onConflictDoNothing();
  }

  return { tasksCreated, storesWithNoAssignment: noAssignmentStores.size };
}

// Called by the new completion endpoint (not the existing rep-facing PATCH)
// when someone captures a Nexus-generated task - whoever gets there first
// wins the credit, looked up from the real Call Cycle roster so the
// lineManager is correct too, not just the repName.
export async function claimTask(uniqueId: string, capturedByEmpId: string): Promise<{ ok: boolean; error?: string }> {
  const [resource] = await db.select().from(resourceRoster).where(eq(resourceRoster.resourceEmpId, capturedByEmpId)).limit(1);
  if (!resource) {
    return { ok: false, error: "Unknown resourceEmpId - not found in roster" };
  }
  await db.execute(sql`
    update nexus_tasks set rep_name = ${resource.resourceName}, line_manager = ${resource.manager || ""},
      resource_type = ${resource.resourceType || ""}
    where unique_id = ${uniqueId} and rep_name = 'Unassigned'
  `);
  return { ok: true };
}

// Deletes all Nexus-generated tasks for a given week - only call this AFTER
// that week has been successfully exported to SharePoint (see
// nexus-weekly-scheduler.ts). Only ever touches nexus_tasks - the real
// `tasks` table (legacy Excel-imported, live production) is never wiped by
// this function.
export async function wipeTasksForWeek(week: string): Promise<number> {
  const result = await db.execute(sql`delete from nexus_tasks where week_ending_date = ${week}`);
  return (result as any).rowCount ?? 0;
}

// Called by GET /api/nexus-tasks/resolve when the weekly batch didn't
// generate a task for this exact SKU/issue (e.g. an Overstock SKU outside
// the capped top-5, or any SKU flagged after the batch ran) - Carin,
// 2026-08-18: "yes we must record it even if that overstock is not in the
// preset table." Confirms the SKU is genuinely flagged for the requested
// classification (never fabricates a task for a SKU that isn't actually an
// issue) using the exact same real thresholds generateTasksForWeek uses,
// then creates it on the spot with the same deterministic uniqueId -
// onConflictDoNothing makes this race-safe if two reps tap the same SKU
// at once. Doesn't touch the overstock cap - a SKU outside the cap still
// gets created here since a rep genuinely trying to capture it should
// never hit a dead end (KPI cards intentionally stay uncapped/live per
// the same conversation).
export async function createTaskOnDemand(params: {
  client: string; store: string; classification: string; barcode: string;
}): Promise<{ uniqueId: string } | null> {
  const sourceStem = params.classification === "cover" ? "risk" : params.classification;
  const normalizedStore = params.store.trim().toUpperCase();

  async function resolveCoverageForStore(storeName: string, client: string): Promise<{ empId: string; resourceName: string }[]> {
    const rows = await db.select().from(storeAssignments)
      .where(sql`upper(trim(${storeAssignments.cleanedStoreName})) = ${storeName.toUpperCase().trim()}`);
    const entries = rows.map((r) => ({ empId: r.resourceEmpId, resourceName: r.resourceName, clientScope: r.clientScope }));
    if (client === "P&G") {
      const dedicated = entries.filter((e) => e.clientScope === "P&G");
      if (dedicated.length > 0) return dedicated;
    }
    return entries.filter((e) => e.clientScope === "SYNDICATED");
  }

  async function insertOnDemand(week: string, opts: {
    client: string; storeName: string; banner?: string | null; region?: string | null;
    barcode: string; articleDescription?: string | null; category?: string | null;
    dcSoh?: unknown; storeSoh?: unknown; sellOutP4?: unknown; cover?: unknown;
    classification?: string | null; missedUnits?: number | null;
  }, actionText: string): Promise<{ uniqueId: string } | null> {
    const assignees = await resolveCoverageForStore(opts.storeName, opts.client);
    if (assignees.length === 0) return null; // real call-cycle gap, not guessed at

    const uniqueId = `NEXUS_${week}_${opts.client}_${opts.storeName}_${sourceStem}_${opts.barcode}`.replace(/\s+/g, "_");

    await db.insert(nexusTasks).values({
      uniqueId, key: uniqueId, client: opts.client, banner: opts.banner || "", region: opts.region || "",
      storeName: opts.storeName, repName: "Unassigned", lineManager: "", category: opts.category || "",
      barcode: opts.barcode, articleDescription: opts.articleDescription || "",
      dcSoh: String(opts.dcSoh ?? ""), storeSoh: String(opts.storeSoh ?? ""), p4WeekSales: String(opts.sellOutP4 ?? ""),
      missedSales: String(opts.missedUnits ?? 0), storeWfc: String(opts.cover ?? ""), stockClassification: opts.classification || "",
      weekEnding: week, weekEndingDate: week, action: actionText, actionStatus: "Pending",
    }).onConflictDoNothing();

    for (const a of assignees) {
      await db.insert(nexusTaskAssignees).values({ taskUniqueId: uniqueId, resourceEmpId: a.empId, resourceName: a.resourceName }).onConflictDoNothing();
    }

    return { uniqueId };
  }

  if (sourceStem === "distribution") {
    const [latestWeekRow] = await db.select({ weekEnding: distributionGaps.weekEnding }).from(distributionGaps)
      .where(sql`upper(trim(${distributionGaps.cleanedStoreName})) = ${normalizedStore} and ${distributionGaps.client} = ${params.client} and ${distributionGaps.barcode} = ${params.barcode}`)
      .orderBy(sql`${distributionGaps.weekEnding} desc`).limit(1);
    if (!latestWeekRow) return null;
    const [row] = await db.select().from(distributionGaps)
      .where(sql`upper(trim(${distributionGaps.cleanedStoreName})) = ${normalizedStore} and ${distributionGaps.client} = ${params.client} and ${distributionGaps.barcode} = ${params.barcode} and ${distributionGaps.weekEnding} = ${latestWeekRow.weekEnding}`)
      .limit(1);
    if (!row) return null;
    return insertOnDemand(row.weekEnding, {
      client: row.client, storeName: row.cleanedStoreName, banner: row.banner, region: null,
      barcode: row.barcode, articleDescription: row.articleDescription, category: row.category,
      storeSoh: 0, classification: row.gapType || "Distribution Gap",
    }, row.suggestedAction || "Distribution gap - review ranging for this store.");
  }

  const [latestWeekRow] = await db.select({ weekEnding: storeSkuWeekly.weekEnding }).from(storeSkuWeekly)
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.client} = ${params.client} and ${storeSkuWeekly.barcode} = ${params.barcode}`)
    .orderBy(sql`${storeSkuWeekly.weekEnding} desc`).limit(1);
  if (!latestWeekRow) return null;
  const [row] = await db.select().from(storeSkuWeekly)
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.client} = ${params.client} and ${storeSkuWeekly.barcode} = ${params.barcode} and ${storeSkuWeekly.weekEnding} = ${latestWeekRow.weekEnding}`)
    .limit(1);
  if (!row) return null;

  // Only ever create a task for a SKU that genuinely qualifies for the
  // requested classification right now - same real thresholds as
  // generateTasksForWeek, never a fabricated task.
  let qualifies = false;
  let overstockDaysThreshold: number | null = null;
  if (sourceStem === "oos" || sourceStem === "low") qualifies = row.sourceStem === sourceStem;
  else if (sourceStem === "overstock") {
    // Real bug found 2026-08-18: this was still checking row.sourceStem ===
    // "overstock" (the old blanket cover>=18 classification) - a client
    // outside the per-client no-sales-days rules (client_overstock_rules)
    // must never qualify here (Davidoff, for one, was explicitly removed
    // from those rules entirely), and a client that IS in the rules must be
    // judged by the same real checkpoint logic generateTasksForWeek uses,
    // not the stale blanket label.
    const [rule] = await db.select().from(clientOverstockRules).where(eq(clientOverstockRules.client, params.client)).limit(1);
    if (rule && (row.storeSoh || 0) > 0) {
      overstockDaysThreshold = rule.noSalesDaysThreshold;
      const weeksNeeded = Math.max(1, Math.ceil(rule.noSalesDaysThreshold / 28));
      const checkpointExists = Array.from({ length: weeksNeeded }, (_, k) => sql`
        exists (
          select 1 from store_sku_weekly chk
          where chk.client = ${params.client}
            and chk.cleaned_store_name = ${normalizedStore}
            and chk.barcode = ${params.barcode}
            and chk.week_ending = (${row.weekEnding}::date - (${k * 4} || ' weeks')::interval)::date::text
            and coalesce(chk.sell_out_p4, 0) = 0
        )
      `);
      const checkResult = await db.execute(sql`select (${sql.join(checkpointExists, sql` and `)}) as ok`);
      const checkRows = (checkResult.rows || checkResult) as any[];
      qualifies = !!checkRows[0]?.ok;
    }
  }
  else if (sourceStem === "risk") qualifies = (row.storeSoh || 0) > 0 && row.cover !== null && row.cover <= AT_RISK_WFC_THRESHOLD_WEEKS;
  else if (sourceStem === "negsoh") qualifies = (row.storeSoh || 0) < 0;
  if (!qualifies) return null;

  const actionText = row.issueDriver === "DC Constraint"
    ? `${row.classification} - DC has no stock (supply constraint). Escalate the order, this isn't fixable on-shelf.`
    : sourceStem === "risk"
      ? `At Risk - ${Number(row.cover).toFixed(1)} weeks cover, replenish before it becomes Out of Stock.`
      : sourceStem === "negsoh"
        ? "Negative SOH - investigate stock count discrepancy."
        : sourceStem === "overstock"
          ? `${row.classification || "Possible Overstock"} - no sales in ${overstockDaysThreshold ?? "?"} days, ${Number(row.cover ?? 0).toFixed(1)} weeks cover. Review for markdown / transfer.`
          : `${row.classification} - review stock levels, ${Math.round(row.estimatedMissedUnits || 0)} units/week at risk.`;

  return insertOnDemand(row.weekEnding, {
    client: row.client, storeName: row.cleanedStoreName, banner: row.banner, region: row.region,
    barcode: row.barcode, articleDescription: row.articleDescription, category: row.category,
    dcSoh: row.dcSoh, storeSoh: row.storeSoh, sellOutP4: row.sellOutP4, cover: row.cover,
    classification: row.classification, missedUnits: row.estimatedMissedUnits,
  }, actionText);
}
