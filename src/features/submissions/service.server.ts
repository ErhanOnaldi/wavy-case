import { eq } from "drizzle-orm";
import type { z } from "zod";
import { calculateEarnings, isAccepting } from "@/features/campaigns/rules";
import { DomainError, isUniqueViolation } from "@/features/errors";
import { initialMetric } from "@/features/metrics/fake-provider";
import { latestMetric } from "@/features/metrics/queries.server";
import { utcDay } from "@/features/shared";
import type { Database } from "@/server/db";
import { lockCampaign } from "@/server/db/locking";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import type { submissionFormSchema } from "./schemas";
import { parsePostUrl } from "./url";

export async function createSubmission(
  db: Database,
  creatorId: string,
  input: z.infer<typeof submissionFormSchema>,
  at?: Date,
) {
  const post = parsePostUrl(input.postUrl);
  if (!post)
    throw new Error("Submission URL must be validated before creation.");
  const metric = initialMetric(`${post.platform}:${post.externalPostId}`);
  try {
    return await db.transaction(async (tx) => {
      const campaign = await lockCampaign(tx, input.campaignId);
      const now = at ?? new Date();
      if (!isAccepting(campaign, now))
        throw new DomainError({ code: "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS" });
      if (!campaign.platforms.includes(post.platform))
        throw new DomainError({ code: "PLATFORM_NOT_ALLOWED" });
      const [submission] = await tx
        .insert(submissions)
        .values({
          ...post,
          campaignId: input.campaignId,
          creatorId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        })
        .returning({ id: submissions.id, status: submissions.status });
      await tx
        .insert(submissionMetrics)
        .values({
          submissionId: submission.id,
          capturedAt: utcDay(now),
          ...metric,
        });
      return submission;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new DomainError({ code: "DUPLICATE_SUBMISSION" });
    throw error;
  }
}

export async function reviewSubmission(
  db: Database,
  reviewerId: string,
  submissionId: string,
  decision: { status: "approved" } | { status: "rejected"; reason: string },
  at?: Date,
) {
  // campaignId is immutable. Re-read mutable status/metrics only after acquiring the campaign lock.
  const [reference] = await db
    .select({ campaignId: submissions.campaignId })
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!reference) throw new DomainError({ code: "NOT_FOUND" });
  return db.transaction(async (tx) => {
    const campaign = await lockCampaign(tx, reference.campaignId);
    const now = at ?? new Date();
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .for("update");
    if (!submission) throw new DomainError({ code: "NOT_FOUND" });
    if (submission.status !== "pending")
      throw new DomainError({ code: "SUBMISSION_ALREADY_REVIEWED" });
    const review = {
      reviewedBy: reviewerId,
      reviewedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (decision.status === "rejected") {
      if (!decision.reason.trim())
        throw new Error("A rejection reason is required.");
      await tx
        .update(submissions)
        .set({
          ...review,
          status: "rejected",
          rejectionReason: decision.reason.trim(),
        })
        .where(eq(submissions.id, submissionId));
      return {
        id: submissionId,
        status: "rejected" as const,
        allocatedEarningsCents: 0,
        budgetLeftCents:
          campaign.totalBudgetCents - campaign.budgetAllocatedCents,
        campaignStatus: campaign.status,
      };
    }
    const metric = await latestMetric(tx, submissionId);
    const required = calculateEarnings(
      metric?.views ?? 0,
      campaign.payoutPer1kViewsCents,
    );
    const available = campaign.totalBudgetCents - campaign.budgetAllocatedCents;
    if (required > available)
      throw new DomainError({
        code: "INSUFFICIENT_BUDGET",
        requiredCents: required,
        availableCents: available,
      });
    if (!isAccepting(campaign, now))
      throw new DomainError({ code: "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS" });
    const budgetAllocatedCents = campaign.budgetAllocatedCents + required;
    const status =
      budgetAllocatedCents === campaign.totalBudgetCents
        ? ("completed" as const)
        : campaign.status;
    await tx
      .update(submissions)
      .set({
        ...review,
        status: "approved",
        allocatedEarningsCents: required,
        approvalOrder: campaign.nextApprovalOrder,
      })
      .where(eq(submissions.id, submissionId));
    await tx
      .update(campaigns)
      .set({
        budgetAllocatedCents,
        status,
        nextApprovalOrder: campaign.nextApprovalOrder + 1,
        version: campaign.version + 1,
        updatedAt: now.toISOString(),
      })
      .where(eq(campaigns.id, campaign.id));
    return {
      id: submissionId,
      status: "approved" as const,
      allocatedEarningsCents: required,
      budgetLeftCents: campaign.totalBudgetCents - budgetAllocatedCents,
      campaignStatus: status,
    };
  });
}
