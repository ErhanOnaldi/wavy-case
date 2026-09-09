import { z } from "zod";
import {
  MAX_VALUE,
  campaignStatuses,
  paginationSchema,
  platforms,
} from "@/features/shared";

const centsSchema = z
  .number({ error: "Enter an amount with at most two decimal places." })
  .int("Enter an amount with at most two decimal places.")
  .min(1, "Amount must be at least $0.01.")
  .max(MAX_VALUE, "Amount must be at most $10,000,000.");

export const campaignFormSchema = z
  .strictObject({
    title: z.string().trim().min(1, "Enter a campaign title.").max(120),
    platforms: z
      .array(z.enum(platforms))
      .min(1, "Select at least one platform.")
      .max(3)
      .refine(
        (value) => new Set(value).size === value.length,
        "Select each platform only once.",
      ),
    payoutPer1kViewsCents: centsSchema,
    totalBudgetCents: centsSchema,
    startsAt: z.iso.datetime({
      offset: true,
      error: "Enter a valid date and time.",
    }),
    endsAt: z.iso.datetime({
      offset: true,
      error: "Enter a valid date and time.",
    }),
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    path: ["endsAt"],
    message: "End must be after the start.",
  })
  .refine(
    (value) =>
      Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 366 * 86_400_000,
    {
      path: ["endsAt"],
      message: "Campaigns can run for up to 366 days.",
    },
  );

export type CampaignForm = z.infer<typeof campaignFormSchema>;
export const campaignUpdateSchema = campaignFormSchema.safeExtend({
  id: z.uuid(),
  expectedVersion: z.number().int().min(1),
});
export const campaignListSchema = paginationSchema
  .extend({
    search: z.string().trim().max(120).optional(),
    status: z.enum(campaignStatuses).optional(),
  })
  .strict();
export const campaignStatusSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().min(1),
  status: z.enum(["active", "paused"]),
});
