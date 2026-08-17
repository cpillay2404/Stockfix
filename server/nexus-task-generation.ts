// Auto-generates rep tasks from the freshly-synced Nexus data, instead of
// tasks being populated manually. Added 2026-08-16 as part of the automatic
// weekly cycle (see nexus-weekly-scheduler.ts): export outgoing week -> sync
// new week -> generate new tasks (this file) -> wipe outgoing week.
import { db } from "./db";
import { storeSkuWeekly, storeAssignments, resourceRoster, tasks, distributionGaps, type InsertTask } from "@shared/schema";
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
//   - Covers all 6 issue types the Insights/Fix screens show: oos, low,
//     overstock (existing source_stem-flagged rows), risk (same
//     storeSoh>0 && cover<=AT_RISK_WFC_THRESHOLD_WEEKS threshold as
//     nexus.ts's computeAtRiskRows), negsoh (storeSoh<0, matching routes.ts's
//     "negsoh" classification exactly), and distribution (every synced
//     distribution_gaps row for the week - matches what routes.ts already
//     shows unfiltered on the Fix/Insights distribution-gap list).
//   - repName/lineManager assignment comes from the real Call Cycle Master
//     data (imported 2026-08-16 into storeAssignments/resourceRoster from
//     "Call Cycle master - Stock Fix.xlsx"), NOT from guessing off old task
//     history (an earlier, wrong attempt - see git history on this file).
//   - A store can have more than one person covering it (confirmed real in
//     the Call Cycle Master - e.g. a syndicated merchandiser AND a
//     syndicated rep on the same store). Rather than creating one task per
//     assigned person (which would inflate every open-task count), this
//     creates ONE task, leaves repName = "Unassigned" until someone actually
//     captures it, and lists everyone eligible in eligibleAssignees so the
//     app can show it to all of them. Whoever captures it first gets
//     credited via a separate completion endpoint (see routes.ts) - the
//     existing rep-facing PATCH /api/tasks/:uniqueId is NOT touched, since
//     the live app depends on it as-is.
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

export async function generateTasksForWeek(week: string): Promise<{ tasksCreated: number; storesWithNoAssignment: number }> {
  const flaggedIssue = await db.execute(sql`
    select client, cleaned_store_name, banner, region, barcode,
      article_description, category, classification, source_stem,
      store_soh, dc_soh, sell_out_p4, cover, estimated_missed_units, issue_driver
    from store_sku_weekly
    where week_ending = ${week}
      and source_stem in ('oos', 'low', 'overstock')
      and estimated_missed_units > 0
  `);

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
  const insertRows: InsertTask[] = [];
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

    insertRows.push({
      uniqueId,
      key: uniqueId,
      client: opts.client,
      banner: opts.banner || "",
      region: opts.region || "",
      storeName: opts.storeName,
      repName: "Unassigned", // set for real by the completion endpoint once someone captures it
      lineManager: "",
      eligibleAssignees: assignees.map((a) => a.resourceName).join(", "),
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
    const created = await db.insert(tasks).values(insertRows.slice(i, i + BATCH)).onConflictDoNothing().returning();
    tasksCreated += created.length;
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
    update tasks set rep_name = ${resource.resourceName}, line_manager = ${resource.manager || ""}
    where unique_id = ${uniqueId} and rep_name = 'Unassigned'
  `);
  return { ok: true };
}

// Deletes all tasks for a given week - only call this AFTER that week has
// been successfully exported to SharePoint (see nexus-weekly-scheduler.ts).
export async function wipeTasksForWeek(week: string): Promise<number> {
  const result = await db.execute(sql`delete from tasks where week_ending_date = ${week}`);
  return (result as any).rowCount ?? 0;
}
