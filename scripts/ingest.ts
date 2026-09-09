import "dotenv/config";
import { createDatabase } from "../src/server/db";
import { ingestMetrics } from "../src/features/metrics/ingest.server";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const { db, pool } = createDatabase(process.env.DATABASE_URL, "wavy-ingest");
  try {
    const result = await ingestMetrics(db);
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("Ingest could not start. Check DATABASE_URL and migrations.");
  process.exitCode = 1;
});
