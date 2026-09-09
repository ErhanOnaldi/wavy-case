import { and, count, desc, eq, gt, ilike, inArray, lte } from "drizzle-orm";
import type { z } from "zod";
import { DomainError } from "@/features/errors";
import { pageResult, safeCount, type Pagination } from "@/features/shared";
import type { Database } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { isAccepting } from "./rules";
import type { campaignListSchema } from "./schemas";
import { summarizeMetrics } from "../metrics/summary";

export const campaignFields = {
  id: campaigns.id,
  title: campaigns.title,
  platforms: campaigns.platforms,
  payoutPer1kViewsCents: campaigns.payoutPer1kViewsCents,
  totalBudgetCents: campaigns.totalBudgetCents,
  budgetAllocatedCents: campaigns.budgetAllocatedCents,
  status: campaigns.status,
  startsAt: campaigns.startsAt,
  endsAt: campaigns.endsAt,
  version: campaigns.version,
};

export async function listCampaigns(
  db: Database,
  input: z.infer<typeof campaignListSchema>,
  creatorOnly = false,
  now = new Date(),
) {
  const where = and(
    input.search
      ? ilike(campaigns.title, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`)
      : undefined,
    creatorOnly
      ? eq(campaigns.status, "active")
      : input.status
        ? eq(campaigns.status, input.status)
        : undefined,
    creatorOnly ? lte(campaigns.startsAt, now.toISOString()) : undefined,
    creatorOnly ? gt(campaigns.endsAt, now.toISOString()) : undefined,
  );
  return db.transaction(
    async (tx) => {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(campaigns)
        .where(where);
      const items = await tx
        .select(campaignFields)
        .from(campaigns)
        .where(where)
        .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
      return pageResult(items, total, input as Pagination);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getCampaign(
  db: Database,
  id: string,
  creatorOnly = false,
  now = new Date(),
) {
  return db.transaction(
    async (tx) => {
      const [campaign] = await tx
        .select(campaignFields)
        .from(campaigns)
        .where(eq(campaigns.id, id));
      if (!campaign || (creatorOnly && !isAccepting(campaign, now)))
        throw new DomainError({ code: "NOT_FOUND" });
      const [submission] = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.campaignId, id))
        .limit(1);
      return { ...campaign, termsLocked: Boolean(submission) };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function campaignOverview(db: Database, campaignId: string) {
  return db.transaction(
    async (tx) => {
      const [campaign] = await tx
        .select(campaignFields)
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      if (!campaign) throw new DomainError({ code: "NOT_FOUND" });
      const metrics = await tx
        .select({
          submissionId: submissionMetrics.submissionId,
          capturedAt: submissionMetrics.capturedAt,
          views: submissionMetrics.views,
        })
        .from(submissionMetrics)
        .innerJoin(
          submissions,
          eq(submissions.id, submissionMetrics.submissionId),
        )
        .where(
          and(
            eq(submissions.campaignId, campaignId),
            inArray(submissions.status, ["approved", "paid"]),
          ),
        )
        .orderBy(submissionMetrics.capturedAt);
      const summary = summarizeMetrics(
        metrics,
        campaign.startsAt,
        campaign.endsAt,
      );
      return {
        ...summary,
        totalApprovedViews: safeCount(summary.totalApprovedViews),
        budgetAllocatedCents: campaign.budgetAllocatedCents,
        budgetLeftCents:
          campaign.totalBudgetCents - campaign.budgetAllocatedCents,
        status: campaign.status,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
