import { db } from "./db";
import { storeSkuWeekly } from "@shared/schema";
import { sql } from "drizzle-orm";
import { fetchLatestWeek, runWeeklySummarySync } from "./nexus-sync";
import { generateTasksForWeek, wipeTasksForWeek } from "./nexus-task-generation";

// Automatic weekly cycle (agreed with Carin 2026-08-16): when a new week
// appears in Nexus -
//   1. export the outgoing week's nexus_tasks (both Completed and Pending -
//      the full set is needed to calculate capture rate) to SharePoint, via
//      /api/nexus-tasks/save-to-sharepoint
//   2. sync the new week's inventory data in
//   3. auto-generate the new week's tasks from that data
//   4. wipe the outgoing week's tasks from the live table (safe - it's
//      already archived in step 1)
// Each step only proceeds if the previous one succeeded - never wipe tasks
// whose export we can't confirm worked.
//
// Real bug found and fixed 2026-08-18: this used to call the LEGACY
// /api/tasks/save-to-sharepoint (the classic tasks table) here, then wipe
// nexus_tasks below regardless - meaning every week's real nexus_tasks
// captures were being deleted with zero backup once this app is actually in
// use. Must export the same table it's about to wipe.
//
// Deliberately simple, one clean pass per check - does NOT auto-retry failed
// clients in a loop. The 2026-08-14/15 backfill session found a real bug in
// an earlier autonomous watchdog script that mis-detected "stalled" syncs and
// kept restarting the server, actively destroying real progress. Any missing
// clients after this runs are visible via GET /api/admin/sync-log and can be
// resumed manually with the existing onlyClients-scoped
// POST /api/admin/nexus-summary-sync?week=X&clients=A,B,C - same as every
// gap-fill done tonight.
async function exportOutgoingWeekToSharePoint(): Promise<{ ok: boolean; week: string | null }> {
  const [row] = await db.execute(sql`select max(week_ending_date) as week from nexus_tasks`).then((r: any) => (r.rows || r));
  const outgoingWeek = row?.week as string | undefined;
  if (!outgoingWeek) {
    console.log("[Nexus Weekly Cycle] No existing nexus_tasks to export - skipping export step");
    return { ok: true, week: null };
  }
  const port = process.env.PORT || "5000";
  const resp = await fetch(`http://127.0.0.1:${port}/api/nexus-tasks/save-to-sharepoint`, { method: "POST" });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) {
    console.error(`[Nexus Weekly Cycle] Export of week ${outgoingWeek} FAILED - will not wipe this week's tasks:`, body);
    return { ok: false, week: outgoingWeek };
  }
  console.log(`[Nexus Weekly Cycle] Exported week ${outgoingWeek} to SharePoint (${body.rows} rows) -> ${body.webUrl || body.filename}`);
  return { ok: true, week: outgoingWeek };
}

async function checkAndSyncLatestWeek(): Promise<void> {
  try {
    const nexusLatest = await fetchLatestWeek();

    const localLatestRows = await db
      .selectDistinct({ weekEnding: storeSkuWeekly.weekEnding })
      .from(storeSkuWeekly)
      .orderBy(sql`${storeSkuWeekly.weekEnding} desc`)
      .limit(1);
    const localLatest = localLatestRows[0]?.weekEnding;

    if (localLatest === nexusLatest) {
      console.log(`[Nexus Weekly Sync] Already up to date (latest=${nexusLatest})`);
      return;
    }

    console.log(`[Nexus Weekly Cycle] New week detected: ${nexusLatest} (local latest was ${localLatest || "none"})`);

    // Step 1: archive the outgoing week's tasks before touching anything else
    const exportResult = await exportOutgoingWeekToSharePoint();

    // Step 2: sync the new week's inventory data
    const result = await runWeeklySummarySync(nexusLatest);
    console.log(
      `[Nexus Weekly Cycle] Sync done: week=${result.week} clientsSynced=${result.clientsSynced} ` +
      `rowsWritten=${result.rowsWritten} weeksPruned=${result.weeksPruned} errors=${result.errors.length}`
    );
    if (result.errors.length > 0) {
      console.log(`[Nexus Weekly Cycle] Some clients failed - check GET /api/admin/sync-log and resume manually if needed:`, result.errors);
    }

    // Step 3: generate the new week's tasks from the freshly-synced data
    const genResult = await generateTasksForWeek(nexusLatest);
    console.log(`[Nexus Weekly Cycle] Generated ${genResult.tasksCreated} tasks for week ${nexusLatest} (${genResult.storesWithNoAssignment} stores had no call-cycle coverage, skipped)`);

    // Step 4: only wipe the outgoing week if its export actually succeeded
    if (exportResult.ok && exportResult.week) {
      const wiped = await wipeTasksForWeek(exportResult.week);
      console.log(`[Nexus Weekly Cycle] Wiped ${wiped} tasks from outgoing week ${exportResult.week} (already archived)`);
    } else if (exportResult.week) {
      console.error(`[Nexus Weekly Cycle] NOT wiping week ${exportResult.week} - export failed, tasks preserved for manual retry`);
    }
  } catch (err) {
    console.error("[Nexus Weekly Cycle] Check failed:", err);
  }
}

export function startNexusWeeklyScheduler(): void {
  // Check every 4 hours - cheap (one index.json call) when there's nothing
  // new, and Nexus's own refresh timing isn't guaranteed to the minute, so
  // polling beats trying to guess an exact schedule.
  const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

  checkAndSyncLatestWeek();
  setInterval(checkAndSyncLatestWeek, CHECK_INTERVAL_MS);
  console.log("[Nexus Weekly Sync] Scheduler started - checking every 4 hours for a new week");
}
