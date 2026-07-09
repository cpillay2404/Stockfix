import { db } from "./db";
import { sql } from "drizzle-orm";

async function runPilotBackup(): Promise<void> {
  try {
    console.log('[Pilot Backup] Starting daily noon backup...');
    const result = await db.execute(sql`
      INSERT INTO pilot_captures (
        backup_date, week_ending_date, unique_id, rep_name, store_name, client,
        line_manager, region, banner, barcode, article_description, action,
        action_status, reason_code, feedback, image1, image2, capture_date,
        store_soh, store_wfc
      )
      SELECT
        NOW(), week_ending_date, unique_id, rep_name, store_name, client,
        line_manager, region, banner, barcode, article_description, action,
        action_status, reason_code, feedback, image1, image2, capture_date,
        store_soh, store_wfc
      FROM tasks
      WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps)
    `);
    console.log('[Pilot Backup] Daily backup completed successfully');
  } catch (err) {
    console.error('[Pilot Backup] Backup failed:', err);
  }
}

export function startPilotBackupScheduler(): void {
  let lastBackupDate: string | null = null;

  const checkAndBackup = () => {
    const now = new Date();
    const saTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
    const hour = saTime.getHours();
    const minute = saTime.getMinutes();
    const dateStr = saTime.toISOString().split('T')[0];

    if (hour === 12 && minute === 0 && lastBackupDate !== dateStr) {
      lastBackupDate = dateStr;
      console.log(`[Pilot Backup] Noon SA time reached — running backup for ${dateStr}`);
      runPilotBackup();
    }
  };

  setInterval(checkAndBackup, 60000);
  console.log('[Pilot Backup] Daily noon backup scheduler started (SA time)');
}
