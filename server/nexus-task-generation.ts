// Auto-generates rep tasks from the freshly-synced Nexus data, instead of
// tasks being populated manually. Added 2026-08-16 as part of the automatic
// weekly cycle (see nexus-weekly-scheduler.ts): export outgoing week -> sync
// new week -> generate new tasks (this file) -> wipe outgoing week.
import { db } from "./db";
import { storeSkuWeekly, storeAssignments, resourceRoster, tasks, type InsertTask } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

// Design decisions (agreed 2026-08-16, see project_stockfix_flag_vs_task_decision
// memory for the related "flag counts as done" decision):
//   - Roll up to the single worst SKU per store per issue-type (oos/low/
//     overstock), not one task per flagged SKU - a store with 50 low-stock
//     lines becomes 1 task, not 50.
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
  const flagged = await db.execute(sql`
    select distinct on (client, cleaned_store_name, source_stem)
      week_ending, client, cleaned_store_name, banner, region, barcode,
      article_description, brand, category, classification, source_stem,
      store_soh, dc_soh, sell_out_p4, cover, estimated_missed_units,
      suggested_order_units, priority, issue_driver
    from store_sku_weekly
    where week_ending = ${week}
      and source_stem in ('oos', 'low', 'overstock')
      and estimated_missed_units > 0
    order by client, cleaned_store_name, source_stem, estimated_missed_units desc
  `);
  const rows = (flagged.rows || flagged) as any[];

  const coverage = await buildStoreCoverageMap();

  const insertRows: InsertTask[] = [];
  let storesWithNoAssignment = 0;

  for (const r of rows) {
    const assignees = resolveAssignees(coverage, r.cleaned_store_name, r.client);
    if (assignees.length === 0) {
      storesWithNoAssignment++;
      continue; // no one on the real call cycle covers this store - a genuine gap to flag, not guess at
    }

    const actionText = r.issue_driver === "DC Constraint"
      ? `${r.classification} - DC has no stock (supply constraint). Escalate the order, this isn't fixable on-shelf.`
      : `${r.classification} - review stock levels, ${Math.round(r.estimated_missed_units)} units/week at risk.`;

    const uniqueId = `NEXUS_${week}_${r.client}_${r.cleaned_store_name}_${r.source_stem}`.replace(/\s+/g, "_");

    insertRows.push({
      uniqueId,
      key: uniqueId,
      client: r.client,
      banner: r.banner || "",
      region: r.region || "",
      storeName: r.cleaned_store_name,
      repName: "Unassigned", // set for real by the completion endpoint once someone captures it
      lineManager: "",
      eligibleAssignees: assignees.map((a) => a.resourceName).join(", "),
      category: r.category || "",
      barcode: r.barcode,
      articleDescription: r.article_description || "",
      dcSoh: String(r.dc_soh ?? ""),
      storeSoh: String(r.store_soh ?? ""),
      p4WeekSales: String(r.sell_out_p4 ?? ""),
      missedSales: String(r.estimated_missed_units ?? ""),
      storeWfc: String(r.cover ?? ""),
      stockClassification: r.classification || "",
      weekEnding: week,
      weekEndingDate: week,
      action: actionText,
      actionStatus: "Pending",
    });
  }

  const BATCH = 500;
  let tasksCreated = 0;
  for (let i = 0; i < insertRows.length; i += BATCH) {
    const created = await db.insert(tasks).values(insertRows.slice(i, i + BATCH)).onConflictDoNothing().returning();
    tasksCreated += created.length;
  }

  return { tasksCreated, storesWithNoAssignment };
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
