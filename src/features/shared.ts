import { z } from "zod";

export const platforms = ["tiktok", "instagram", "youtube"] as const;
export const campaignStatuses = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;
export const submissionStatuses = [
  "pending",
  "approved",
  "rejected",
  "paid",
] as const;
export const MAX_VALUE = 1_000_000_000;
export const paginationSchema = z.object({
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;
export const idSchema = z.strictObject({ id: z.uuid() });
export const campaignIdSchema = z.strictObject({ campaignId: z.uuid() });

export function pageResult<T>(
  items: T[],
  totalItems: number,
  input: Pagination,
) {
  return {
    items,
    ...input,
    totalItems,
    totalPages: Math.ceil(totalItems / input.pageSize),
  };
}

export function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function safeCount(value: number | string) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error("Counter is outside the supported range.");
  return count;
}
