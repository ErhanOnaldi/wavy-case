import { z } from "zod";
import { paginationSchema, submissionStatuses } from "@/features/shared";
import { parsePostUrl } from "./url";

export const submissionFormSchema = z.strictObject({
  campaignId: z.uuid(),
  postUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => parsePostUrl(value) !== null,
      "Enter a TikTok video, Instagram post/reel, or YouTube post URL.",
    ),
});
export const reviewSchema = z.strictObject({ submissionId: z.uuid() });
export const rejectionSchema = reviewSchema.extend({
  reason: z.string().trim().min(1, "A rejection reason is required.").max(1000),
});
export const mySubmissionsSchema = paginationSchema
  .extend({ status: z.enum(submissionStatuses).optional() })
  .strict();
export const reviewQueueSchema = paginationSchema
  .extend({ campaignId: z.uuid() })
  .strict();
