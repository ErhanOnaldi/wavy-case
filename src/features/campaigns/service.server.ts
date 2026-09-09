import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { DomainError } from "@/features/errors";
import type { Database } from "@/server/db";
import { lockCampaign } from "@/server/db/locking";
import { campaigns, submissions } from "@/server/db/schema";
import type {
  CampaignForm,
  campaignStatusSchema,
  campaignUpdateSchema,
} from "./schemas";

export async function createCampaign(
  db: Database,
  input: CampaignForm,
  now = new Date(),
) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      ...input,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .returning({ id: campaigns.id, version: campaigns.version });
  return campaign;
}

export async function updateCampaign(
  db: Database,
  input: z.infer<typeof campaignUpdateSchema>,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const current = await lockCampaign(tx, input.id);
    if (current.version !== input.expectedVersion)
      throw new DomainError({ code: "STALE_CAMPAIGN" });
    if (current.status === "completed")
      throw new DomainError({ code: "INVALID_STATUS_TRANSITION" });
    const [existing] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.campaignId, input.id))
      .limit(1);
    const termsChanged =
      current.payoutPer1kViewsCents !== input.payoutPer1kViewsCents ||
      [...current.platforms].sort().join() !==
        [...input.platforms].sort().join() ||
      Date.parse(current.startsAt) !== Date.parse(input.startsAt) ||
      Date.parse(current.endsAt) !== Date.parse(input.endsAt);
    if (
      existing &&
      (termsChanged || input.totalBudgetCents < current.totalBudgetCents)
    ) {
      throw new DomainError({ code: "CAMPAIGN_TERMS_LOCKED" });
    }
    const { id, expectedVersion: _version, ...values } = input;
    void _version;
    const [result] = await tx
      .update(campaigns)
      .set({
        ...values,
        version: current.version + 1,
        updatedAt: now.toISOString(),
      })
      .where(eq(campaigns.id, id))
      .returning({ id: campaigns.id, version: campaigns.version });
    return result;
  });
}

export async function setCampaignStatus(
  db: Database,
  input: z.infer<typeof campaignStatusSchema>,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const campaign = await lockCampaign(tx, input.id);
    if (campaign.version !== input.expectedVersion)
      throw new DomainError({ code: "STALE_CAMPAIGN" });
    const allowed =
      input.status === "active"
        ? ["draft", "paused"].includes(campaign.status)
        : campaign.status === "active";
    if (
      !allowed ||
      campaign.budgetAllocatedCents === campaign.totalBudgetCents
    ) {
      throw new DomainError({ code: "INVALID_STATUS_TRANSITION" });
    }
    const [result] = await tx
      .update(campaigns)
      .set({
        status: input.status,
        version: sql`${campaigns.version} + 1`,
        updatedAt: now.toISOString(),
      })
      .where(eq(campaigns.id, input.id))
      .returning({
        id: campaigns.id,
        status: campaigns.status,
        version: campaigns.version,
      });
    return result;
  });
}
