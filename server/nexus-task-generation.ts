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
import { storeSkuWeekly, storeAssignments, resourceRoster, nexusTasks, nexusTaskAssignees, distributionGaps, clientOverstockRules, weekGenerationLog, type InsertNexusTask } from "@shared/schema";
import { resolveEligibleResourceCoverage, type ClientScopedResource } from "@shared/resource-client-scope";
import { sql, eq, and } from "drizzle-orm";
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
type TaskCoverageResource = ClientScopedResource;

async function buildStoreCoverageMap(): Promise<Map<string, TaskCoverageResource[]>> {
  const rows = await db
    .select({
      cleanedStoreName: storeAssignments.cleanedStoreName,
      empId: storeAssignments.resourceEmpId,
      resourceName: storeAssignments.resourceName,
      clientScope: storeAssignments.clientScope,
      resourceType: resourceRoster.resourceType,
    })
    .from(storeAssignments)
    .leftJoin(
      resourceRoster,
      sql`upper(trim(${storeAssignments.resourceEmpId})) = upper(trim(${resourceRoster.resourceEmpId}))`,
    );
  const map = new Map<string, TaskCoverageResource[]>();
  for (const r of rows) {
    const key = r.cleanedStoreName.toUpperCase().trim();
    const list = map.get(key) || [];
    list.push({ empId: r.empId, resourceName: r.resourceName, clientScope: r.clientScope, resourceType: r.resourceType });
    map.set(key, list);
  }
  return map;
}

// Real gap found 2026-08-20 (Carin: "cant you take it from the call cycle
// for stock fix") - Nexus's own store master is badly incomplete for
// smaller/convenience formats (confirmed: Usave 11.7% complete, liquor
// shops 38-54%, vs 97-100% for big established chains), while the Call
// Cycle Master file Carin maintains directly is 100% complete on region.
// Used as a fallback wherever Nexus's own region comes back blank.
async function buildStoreRegionMap(): Promise<Map<string, string>> {
  const rows = await db.select({ cleanedStoreName: storeAssignments.cleanedStoreName, region: storeAssignments.region }).from(storeAssignments);
  const map = new Map<string, string>();
  // Real bug found 2026-08-20, right after adding this fallback: Nexus's
  // own region values are UPPERCASE ("GAUTENG") but Call Cycle Master's
  // are Title Case ("Gauteng") - storing the fallback as-is fragmented
  // every region into two rows depending on which source supplied it.
  // Uppercase here so region stays consistent regardless of source.
  for (const r of rows) {
    if (r.region) r.region = r.region.toUpperCase();
  }
  for (const r of rows) {
    if (!r.region) continue;
    const key = String(r.cleanedStoreName).toUpperCase().trim();
    if (!map.has(key)) map.set(key, r.region);
  }
  return map;
}

// Generalized 2026-08-18 - this only ever special-cased "P&G" (real bug
// found the same day: a Duracell-dedicated rep was showing up assigned to
// Sodastream tasks, because every non-P&G client fell straight through to
// the SYNDICATED-only filter, never checking for that client's own
// dedicated coverage). store_assignments now has real per-client scopes
// (DURACELL/SODASTREAM/AQUELLE/NESTLE/P&G/SYNDICATED) after today's
// rebuild, so dedicated-overrides-syndicated must apply to all of them,
// not just P&G.
function resolveAssignees(
  coverage: Map<string, TaskCoverageResource[]>,
  storeName: string,
  client: string
): { empId: string; resourceName: string }[] {
  const entries = coverage.get(String(storeName).toUpperCase().trim()) || [];
  return resolveEligibleResourceCoverage(entries, client);
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
        and upper(trim(curr.cleaned_store_name)) = upper(trim(${store}))
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
  // Real bug found 2026-08-28 (Carin: "low stock" showing 0 on Fix at
  // multiple stores despite Insights showing real Low Stock counts) -
  // confirmed directly: 100% of Low Stock rows have estimated_missed_units
  // = NULL (never populated for this source_stem at all, unlike OOS which
  // has it calculated for roughly half its rows) - so the blanket
  // `estimated_missed_units > 0` requirement below silently excluded
  // essentially every Low Stock row from ever getting a task generated,
  // for every store, every week. Carin's call: Low Stock rows qualify on
  // being flagged at all, not on a missed-units figure Nexus never
  // actually computes for this classification - OOS keeps the stricter
  // estimated_missed_units > 0 requirement unchanged.
  const flaggedIssue = await db.execute(sql`
    select client, cleaned_store_name, banner, region, barcode,
      article_description, category, classification, source_stem,
      store_soh, dc_soh, sell_out_p4, cover, estimated_missed_units, issue_driver
    from store_sku_weekly
    where week_ending = ${week}
      and (
        (source_stem = 'oos' and estimated_missed_units > 0)
        or source_stem = 'low'
      )
      and (article_status is null or article_status != 'Discontinued')
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
        and (curr.article_status is null or curr.article_status != 'Discontinued')
        and ${sql.join(checkpointExists, sql` and `)}
    `);
    flaggedOverstock.push(...((rows.rows || rows) as any[]));
  }

  // Insights' Overstock KPI is "all overstocks" - the original blanket
  // definition Nexus itself computes and nexus-sync.ts writes into
  // store_weekly_summary.overstockCount, exactly as it was before any of
  // today's per-client work (Carin, 2026-08-18: "exactly as it was before
  // we introduced the client compute"). generateTasksForWeek must never
  // touch that column - flaggedOverstock above (the per-client rule result)
  // is only used below to create real nexus_tasks rows, which is what
  // powers Fix's separate, client-computed number instead.

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
  const regionByStore = await buildStoreRegionMap();
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
    // Real change 2026-08-20 (Carin: "can you use the call cycle please") -
    // Call Cycle Master's region now wins whenever there's a match, not just
    // as a blank-fallback. Confirmed it's not only more complete than
    // Nexus's own store master (see buildStoreRegionMap) but a cleaner,
    // more precise taxonomy - Nexus lumps a wide swath of real towns
    // (Umtata, George, Oudtshoorn, Beaufort West...) into one generic
    // "Eastern Cape" catch-all, while Call Cycle Master already splits
    // them into the real sales regions the team actually uses (e.g. "SWD"
    // for the Garden Route). Only falls back to Nexus's own region if Call
    // Cycle Master has no entry at all for that store.
    const ccmRegion = regionByStore.get(String(opts.storeName).toUpperCase().trim());
    if (ccmRegion) {
      opts.region = ccmRegion;
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
export async function claimTask(uniqueId: string, capturedByEmpId: string): Promise<{ ok: boolean; error?: string; conflict?: boolean }> {
  const [resource] = await db.select().from(resourceRoster).where(eq(resourceRoster.resourceEmpId, capturedByEmpId)).limit(1);
  if (!resource) {
    return { ok: false, error: "Unknown resourceEmpId - not found in roster" };
  }
  const [task] = await db.select({ uniqueId: nexusTasks.uniqueId, repName: nexusTasks.repName })
    .from(nexusTasks)
    .where(eq(nexusTasks.uniqueId, uniqueId))
    .limit(1);
  if (!task) {
    return { ok: false, error: "Task not found" };
  }

  const [eligible] = await db.select({ id: nexusTaskAssignees.id })
    .from(nexusTaskAssignees)
    .where(and(
      eq(nexusTaskAssignees.taskUniqueId, uniqueId),
      eq(nexusTaskAssignees.resourceEmpId, capturedByEmpId),
    ))
    .limit(1);
  if (!eligible) {
    return { ok: false, error: "This task is not assigned to the verified StockFix identity" };
  }

  if ((task.repName || "").trim().toUpperCase() === resource.resourceName.trim().toUpperCase()) {
    return { ok: true };
  }
  if ((task.repName || "").trim().toUpperCase() !== "UNASSIGNED" && (task.repName || "").trim() !== "") {
    return { ok: false, conflict: true, error: "This task has already been claimed by another rep" };
  }

  const [claimed] = await db.update(nexusTasks)
    .set({
      repName: resource.resourceName,
      lineManager: resource.manager || "",
      resourceType: resource.resourceType || "",
      updatedAt: new Date(),
    })
    .where(and(
      eq(nexusTasks.uniqueId, uniqueId),
      sql`upper(trim(${nexusTasks.repName})) in ('', 'UNASSIGNED')`,
    ))
    .returning({ uniqueId: nexusTasks.uniqueId });
  if (claimed) {
    return { ok: true };
  }

  return { ok: false, conflict: true, error: "This task has already been claimed by another rep" };
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

// Real gap found 2026-08-26 - a network-wide resync (tens of thousands of
// task/resource pairs) reliably takes longer than Replit's platform-level
// ~5 minute request timeout, so a caller awaiting this inside one HTTP
// request always gets a 504 even when the resync itself would eventually
// succeed. Same fix already proven for the Nexus sync
// (isSyncRunning/markSyncStarted/markSyncFinished/getSyncJobStatus in
// nexus-sync.ts) - the route responds instantly and hands back status
// separately via GET /api/admin/resync-task-assignees/status instead of
// holding one long connection open.
type ResyncResult = { pairsChecked: number; pairsChanged: number; rowsAdded: number; rowsRemoved: number };
interface ResyncJobStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastResult: ResyncResult | null;
  lastError: string | null;
}
let resyncJob: ResyncJobStatus = { running: false, startedAt: null, finishedAt: null, lastResult: null, lastError: null };

export function isResyncRunning(): boolean {
  return resyncJob.running;
}
export function markResyncStarted(): void {
  resyncJob = { running: true, startedAt: new Date().toISOString(), finishedAt: null, lastResult: null, lastError: null };
}
export function markResyncFinished(result: ResyncResult | null, error?: string): void {
  resyncJob = { ...resyncJob, running: false, finishedAt: new Date().toISOString(), lastResult: result, lastError: error || null };
}
export function getResyncJobStatus(): ResyncJobStatus {
  return { ...resyncJob };
}

// Real gap found 2026-08-24 (Carin: "check greenstone why is not showing
// the name of the P&G fieldmarketer" - traced to eligible-assignee rows
// being a one-time snapshot from whenever tasks were generated, never
// refreshed when Call Cycle Master changes afterward - confirmed 8,000+
// mismatches network-wide between current coverage and what's actually
// on still-open tasks). Recomputes eligibility for every OPEN task using
// the exact same coverage map + resolveAssignees logic generateTasksForWeek
// uses, and reconciles nexus_task_assignees to match - never touches
// repName/actionStatus/anything on a completed task, only who's still
// eligible to work on something still open.
export async function resyncOpenTaskAssignees(): Promise<ResyncResult> {
  const coverage = await buildStoreCoverageMap();

  const openTasksResult = await db.execute(sql`
    select unique_id as "uniqueId", upper(trim(store_name)) as "storeKey", client
    from nexus_tasks
    where action_status != 'Completed'
  `);
  const openTasks = (openTasksResult.rows || openTasksResult) as { uniqueId: string; storeKey: string; client: string }[];

  const taskIdsByPair = new Map<string, string[]>();
  for (const t of openTasks) {
    const pairKey = `${t.storeKey}::${t.client}`;
    const list = taskIdsByPair.get(pairKey) || [];
    list.push(t.uniqueId);
    taskIdsByPair.set(pairKey, list);
  }

  const currentAssigneesResult = await db.execute(sql`
    select a.task_unique_id as "taskUniqueId", a.resource_emp_id as "empId",
      upper(trim(t.store_name)) as "storeKey", t.client
    from nexus_task_assignees a
    join nexus_tasks t on t.unique_id = a.task_unique_id
    where t.action_status != 'Completed'
  `);
  const currentAssigneeRows = (currentAssigneesResult.rows || currentAssigneesResult) as
    { taskUniqueId: string; empId: string; storeKey: string; client: string }[];
  const currentByTask = new Map<string, Set<string>>();
  for (const r of currentAssigneeRows) {
    const key = r.taskUniqueId;
    if (!currentByTask.has(key)) currentByTask.set(key, new Set());
    currentByTask.get(key)!.add((r.empId || "").toUpperCase().trim());
  }

  // Real perf bug found 2026-08-26 - the original version of this loop
  // issued one DELETE/INSERT per individual changed row, awaited one at a
  // time. That's fine at small scale but with today's much larger dataset
  // (a fresh Call Cycle Master import + a newly generated week) it made
  // this look permanently hung rather than just slow - thousands of
  // sequential round-trips to Neon. Computing every removal/addition in
  // memory first, then writing in 500-row batches (same chunk size and
  // sql.join-based IN-list pattern already proven elsewhere in this file),
  // cuts a many-minutes run down to a real, bounded one, with progress
  // logged along the way so a genuinely large run is visibly progressing
  // rather than indistinguishable from stuck.
  const removals: { uniqueId: string; empId: string }[] = [];
  const additions: { uniqueId: string; empId: string; resourceName: string }[] = [];
  let pairsChecked = 0, pairsChanged = 0;
  for (const [pairKey, taskIds] of Array.from(taskIdsByPair.entries())) {
    pairsChecked++;
    const [storeKey, client] = pairKey.split("::");
    const entries = coverage.get(storeKey) || [];
    const expected = resolveEligibleResourceCoverage(entries, client);
    const expectedSet = new Set(expected.map((e) => e.empId.toUpperCase().trim()));

    let pairChanged = false;
    for (const uniqueId of taskIds) {
      const currentSet = currentByTask.get(uniqueId) || new Set();
      const toRemove = Array.from(currentSet).filter((id) => !expectedSet.has(id));
      const toAdd = expected.filter((e) => !currentSet.has(e.empId.toUpperCase().trim()));
      if (toRemove.length === 0 && toAdd.length === 0) continue;
      pairChanged = true;
      for (const id of toRemove) removals.push({ uniqueId, empId: id });
      for (const e of toAdd) additions.push({ uniqueId, empId: e.empId, resourceName: e.resourceName });
    }
    if (pairChanged) pairsChanged++;
    if (pairsChecked % 2000 === 0) {
      console.log(`[resyncOpenTaskAssignees] computed ${pairsChecked}/${taskIdsByPair.size} pairs...`);
    }
  }
  console.log(`[resyncOpenTaskAssignees] computed all ${taskIdsByPair.size} pairs - ${removals.length} removals, ${additions.length} additions to apply`);

  const CHUNK = 500;
  for (let i = 0; i < removals.length; i += CHUNK) {
    const batch = removals.slice(i, i + CHUNK);
    // Grouped by uniqueId so each statement's IN-list is just the emp IDs to
    // remove for that one task, matching the unique constraint's shape -
    // avoids building one giant OR'd condition across mixed tasks.
    const byTask = new Map<string, string[]>();
    for (const r of batch) {
      const list = byTask.get(r.uniqueId) || [];
      list.push(r.empId);
      byTask.set(r.uniqueId, list);
    }
    for (const [uniqueId, empIds] of Array.from(byTask.entries())) {
      await db.execute(sql`
        delete from nexus_task_assignees
        where task_unique_id = ${uniqueId} and upper(trim(resource_emp_id)) in (${sql.join(empIds.map((id) => sql`${id}`), sql`, `)})
      `);
    }
    if ((i + CHUNK) % 5000 < CHUNK) console.log(`[resyncOpenTaskAssignees] removed ${Math.min(i + CHUNK, removals.length)}/${removals.length}...`);
  }
  for (let i = 0; i < additions.length; i += CHUNK) {
    const batch = additions.slice(i, i + CHUNK);
    await db.insert(nexusTaskAssignees)
      .values(batch.map((a) => ({ taskUniqueId: a.uniqueId, resourceEmpId: a.empId, resourceName: a.resourceName })))
      .onConflictDoNothing();
    if ((i + CHUNK) % 5000 < CHUNK) console.log(`[resyncOpenTaskAssignees] added ${Math.min(i + CHUNK, additions.length)}/${additions.length}...`);
  }
  console.log(`[resyncOpenTaskAssignees] done - ${pairsChanged}/${pairsChecked} pairs changed, ${additions.length} added, ${removals.length} removed`);

  return { pairsChecked, pairsChanged, rowsAdded: additions.length, rowsRemoved: removals.length };
}

export async function resolveOnDemandCoverage(storeName: string, client: string): Promise<{ empId: string; resourceName: string }[]> {
  const rows = await db
    .select({
      empId: storeAssignments.resourceEmpId,
      resourceName: storeAssignments.resourceName,
      clientScope: storeAssignments.clientScope,
      resourceType: resourceRoster.resourceType,
    })
    .from(storeAssignments)
    .leftJoin(
      resourceRoster,
      sql`upper(trim(${storeAssignments.resourceEmpId})) = upper(trim(${resourceRoster.resourceEmpId}))`,
    )
    .where(sql`upper(trim(${storeAssignments.cleanedStoreName})) = ${storeName.toUpperCase().trim()}`);
  return resolveEligibleResourceCoverage(rows, client);
}

export async function isEligibleForOnDemandTask(storeName: string, client: string, resourceEmpId: string): Promise<boolean> {
  const coverage = await resolveOnDemandCoverage(storeName, client);
  return coverage.some((resource) => resource.empId.trim().toUpperCase() === resourceEmpId.trim().toUpperCase());
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
// Real incident 2026-09-02/03 (Carin: "the tasks loaded for that week belong
// to that month ... it should fall under August", "tasks captured today must
// fall under August"): storeSkuWeekly/distributionGaps get fresh data as soon
// as the weekly inventory sync runs, but that happens well BEFORE the week is
// officially retired/generated (nexus-wipe-week + nexus-generate-tasks, run
// manually as the last step of the weekly cycle). Picking "whatever week has
// the newest synced data" here meant a single rep tap could create a task
// under a week nobody had generated yet, which then hijacked the whole
// Adoption dashboard's "current week" detection (max(week_ending_date)).
// The one and only source of truth for "which week is actually live" is
// week_generation_log - so on-demand captures are capped to that week, never
// to whatever the raw sync happens to have most recently.
async function getOfficialCurrentWeek(): Promise<string | null> {
  const [row] = await db.select({ weekEnding: weekGenerationLog.weekEnding }).from(weekGenerationLog)
    .orderBy(sql`${weekGenerationLog.weekEnding} desc`).limit(1);
  return row?.weekEnding ?? null;
}

export async function createTaskOnDemand(params: {
  client: string; store: string; classification: string; barcode: string;
}): Promise<{ uniqueId: string } | null> {
  const officialWeek = await getOfficialCurrentWeek();
  const sourceStem = params.classification === "cover" ? "risk" : params.classification;
  const normalizedStore = params.store.trim().toUpperCase();
  // Real gap found 2026-08-22 (Carin: Checkers Corkwood Square/Clicks
  // Plettenburg Bay showing region "EASTERN CAPE" - Nexus's generic
  // catch-all - even though Call Cycle Master has the real, precise region
  // for both). generateTasksForWeek's pushRow already prefers Call Cycle
  // Master's region whenever it has an entry; this on-demand path (used
  // when a rep captures a SKU outside the pre-generated list) never did.
  const regionByStore = await buildStoreRegionMap();

  async function insertOnDemand(week: string, opts: {
    client: string; storeName: string; banner?: string | null; region?: string | null;
    barcode: string; articleDescription?: string | null; category?: string | null;
    dcSoh?: unknown; storeSoh?: unknown; sellOutP4?: unknown; cover?: unknown;
    classification?: string | null; missedUnits?: number | null;
  }, actionText: string): Promise<{ uniqueId: string } | null> {
    const assignees = await resolveOnDemandCoverage(opts.storeName, opts.client);
    if (assignees.length === 0) return null; // real call-cycle gap, not guessed at

    const ccmRegion = regionByStore.get(String(opts.storeName).toUpperCase().trim());
    if (ccmRegion) opts.region = ccmRegion;

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
      .where(sql`upper(trim(${distributionGaps.cleanedStoreName})) = ${normalizedStore} and ${distributionGaps.client} = ${params.client} and ${distributionGaps.barcode} = ${params.barcode}${officialWeek ? sql` and ${distributionGaps.weekEnding} <= ${officialWeek}` : sql``}`)
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
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.client} = ${params.client} and ${storeSkuWeekly.barcode} = ${params.barcode}${officialWeek ? sql` and ${storeSkuWeekly.weekEnding} <= ${officialWeek}` : sql``}`)
    .orderBy(sql`${storeSkuWeekly.weekEnding} desc`).limit(1);
  if (!latestWeekRow) return null;
  const [row] = await db.select().from(storeSkuWeekly)
    .where(sql`upper(trim(${storeSkuWeekly.cleanedStoreName})) = ${normalizedStore} and ${storeSkuWeekly.client} = ${params.client} and ${storeSkuWeekly.barcode} = ${params.barcode} and ${storeSkuWeekly.weekEnding} = ${latestWeekRow.weekEnding}`)
    .limit(1);
  if (!row) return null;
  if (row.articleStatus === "Discontinued") return null;

  // Only ever create a task for a SKU that genuinely qualifies for the
  // requested classification right now - same real thresholds as
  // generateTasksForWeek, never a fabricated task.
  // Real bug found 2026-08-18 (Carin: Shoprite Cradock/P&G capture attempt
  // failed with "no task found") - overstock used to require the SKU to
  // independently re-qualify under client_overstock_rules' no-sales-days
  // checkpoint logic, a narrower definition than the blanket
  // sourceStem="overstock" list a rep is actually looking at (same
  // inconsistency just fixed on the list endpoint above). A client with no
  // rule configured at all - or a SKU that doesn't happen to meet that
  // stricter threshold - could never be captured even though it's sitting
  // right there in the list. Overstock now qualifies the same simple way
  // oos/low/risk/negsoh already do: match the real synced classification.
  let qualifies = false;
  if (sourceStem === "oos" || sourceStem === "low" || sourceStem === "overstock") qualifies = row.sourceStem === sourceStem;
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
          ? `${row.classification || "Possible Overstock"} - ${Number(row.cover ?? 0).toFixed(1)} weeks cover. Review for markdown / transfer.`
          : `${row.classification} - review stock levels, ${Math.round(row.estimatedMissedUnits || 0)} units/week at risk.`;

  return insertOnDemand(row.weekEnding, {
    client: row.client, storeName: row.cleanedStoreName, banner: row.banner, region: row.region,
    barcode: row.barcode, articleDescription: row.articleDescription, category: row.category,
    dcSoh: row.dcSoh, storeSoh: row.storeSoh, sellOutP4: row.sellOutP4, cover: row.cover,
    classification: row.classification, missedUnits: row.estimatedMissedUnits,
  }, actionText);
}
