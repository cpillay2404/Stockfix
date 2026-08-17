import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// keepAlive + idleTimeoutMillis added 2026-08-14: the multi-hour per-SKU
// backfill kept dying silently mid-run with no error logged and no active
// query in pg_stat_activity - consistent with Supabase's pooler quietly
// dropping an idle-but-still-checked-out connection, which the default pg
// Pool never detects or recovers from on its own. TCP keepalive pings stop
// that from happening silently; a shorter idle timeout means a genuinely
// dead connection gets recycled instead of being handed out again.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client (pool will recover automatically):", err);
});
export const db = drizzle(pool, { schema });
