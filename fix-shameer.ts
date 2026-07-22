import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function run() {
  // First check what's there
  const check = await db.execute(
    sql`SELECT rep_name, line_manager FROM tasks WHERE UPPER(TRIM(rep_name)) IN ('ANATHI MARTINS','APHIWE KAINGANA','BAMANYE SIFUMBA','JAMES DE WITT','NTLAHLA NANINI','YEKISWA MAKANDA','LUCA HARTSENBERG') AND action_status = 'Completed' LIMIT 5`
  );
  console.log("Before:", JSON.stringify(check.rows));

  const result = await db.execute(
    sql`UPDATE tasks SET line_manager = 'SHAMEER WILLIAMS'
        WHERE UPPER(TRIM(line_manager)) = 'RENE MAROULIS'
        AND UPPER(TRIM(rep_name)) IN (
          'ANATHI MARTINS','APHIWE KAINGANA','BAMANYE SIFUMBA',
          'JAMES DE WITT','NTLAHLA NANINI','YEKISWA MAKANDA','LUCA HARTSENBERG'
        )`
  );
  console.log("Updated rows:", result.rowCount);
  await pool.end();
}
run().catch(console.error);
