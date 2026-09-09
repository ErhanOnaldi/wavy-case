import { desc, eq } from "drizzle-orm";
import { submissionMetrics } from "@/server/db/schema";
import type { Executor } from "@/server/db";

export async function latestMetric(db: Executor, submissionId: string) {
  const [metric] = await db
    .select()
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(desc(submissionMetrics.capturedAt))
    .limit(1);
  return metric;
}
