import { and, eq } from "drizzle-orm";
import { calculateEarnings } from "@/features/campaigns/rules";
import { utcDay } from "@/features/shared";
import type { Database } from "@/server/db";
import { lockCampaign } from "@/server/db/locking";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import {
  addIncrement,
  dailyIncrement,
  type MetricCounts,
} from "./fake-provider";
import { latestMetric } from "./queries.server";

export type IngestResult = {
  day: string;
  inserted: number;
  skipped: number;
  failures: { submissionId: string; message: string }[];
};

export async function ingestMetrics(
  db: Database,
  options: {
    now?: Date;
    increment?: (submissionId: string, day: string) => MetricCounts;
  } = {},
): Promise<IngestResult> {
  const now = options.now ?? new Date();
  const day = utcDay(now);
  const result: IngestResult = { day, inserted: 0, skipped: 0, failures: [] };
  const targets = await db
    .select({ id: submissions.id, campaignId: submissions.campaignId })
    .from(submissions)
    .where(eq(submissions.status, "approved"))
    .orderBy(submissions.campaignId, submissions.approvalOrder);
  const campaignIds = [...new Set(targets.map((target) => target.campaignId))];
  for (const campaignId of campaignIds) {
    const group = targets.filter((target) => target.campaignId === campaignId);
    // Provider work happens before locking; a per-record provider failure must not stop the batch.
    const increments = new Map<string, MetricCounts | Error>();
    for (const target of group) {
      try {
        increments.set(
          target.id,
          (options.increment ?? dailyIncrement)(target.id, day),
        );
      } catch {
        increments.set(target.id, new Error("Metric provider failed."));
      }
    }
    try {
      const committed = await db.transaction(async (tx) => {
        let campaign = await lockCampaign(tx, campaignId);
        const batch = {
          inserted: 0,
          skipped: 0,
          failures: [] as IngestResult["failures"],
        };
        for (const target of group) {
          try {
            const change = await tx.transaction(async (savepoint) => {
              const [submission] = await savepoint
                .select()
                .from(submissions)
                .where(eq(submissions.id, target.id))
                .for("update");
              if (!submission || submission.status !== "approved") return null;
              const [existing] = await savepoint
                .select({ id: submissionMetrics.id })
                .from(submissionMetrics)
                .where(
                  and(
                    eq(submissionMetrics.submissionId, target.id),
                    eq(submissionMetrics.capturedAt, day),
                  ),
                )
                .limit(1);
              if (existing) return null;
              const increment = increments.get(target.id)!;
              if (increment instanceof Error) throw increment;
              const previous = await latestMetric(savepoint, target.id);
              if (previous && previous.capturedAt > day)
                throw new Error("Backdated metrics are not supported.");
              const metric = addIncrement(
                previous ?? { views: 0, likes: 0, comments: 0 },
                increment,
              );
              const [inserted] = await savepoint
                .insert(submissionMetrics)
                .values({ submissionId: target.id, capturedAt: day, ...metric })
                .onConflictDoNothing({
                  target: [
                    submissionMetrics.submissionId,
                    submissionMetrics.capturedAt,
                  ],
                })
                .returning({ id: submissionMetrics.id });
              if (!inserted) return null;
              const estimated = calculateEarnings(
                metric.views,
                campaign.payoutPer1kViewsCents,
              );
              const grant = Math.min(
                Math.max(0, estimated - submission.allocatedEarningsCents),
                campaign.totalBudgetCents - campaign.budgetAllocatedCents,
              );
              if (grant === 0) return campaign;
              const allocated = campaign.budgetAllocatedCents + grant;
              await savepoint
                .update(submissions)
                .set({
                  allocatedEarningsCents:
                    submission.allocatedEarningsCents + grant,
                  updatedAt: now.toISOString(),
                })
                .where(eq(submissions.id, target.id));
              const [updated] = await savepoint
                .update(campaigns)
                .set({
                  budgetAllocatedCents: allocated,
                  status:
                    allocated === campaign.totalBudgetCents
                      ? "completed"
                      : campaign.status,
                  version: campaign.version + 1,
                  updatedAt: now.toISOString(),
                })
                .where(eq(campaigns.id, campaignId))
                .returning();
              return updated;
            });
            if (change) {
              campaign = change;
              batch.inserted++;
            } else batch.skipped++;
          } catch (error) {
            batch.failures.push({
              submissionId: target.id,
              message:
                error instanceof Error &&
                [
                  "Metric provider failed.",
                  "Backdated metrics are not supported.",
                  "Invalid metric increment.",
                ].includes(error.message)
                  ? error.message
                  : "Metric could not be saved; this submission was rolled back.",
            });
          }
        }
        return batch;
      });
      result.inserted += committed.inserted;
      result.skipped += committed.skipped;
      result.failures.push(...committed.failures);
    } catch {
      result.failures.push(
        ...group.map((target) => ({
          submissionId: target.id,
          message:
            "Campaign sync could not commit; no changes were saved for this campaign.",
        })),
      );
    }
  }
  return result;
}
