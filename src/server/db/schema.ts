import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  MAX_VALUE,
  campaignStatuses,
  platforms,
  submissionStatuses,
} from "@/features/shared";

export const appSchema = pgSchema("app");
export const roleEnum = appSchema.enum("user_role", ["admin", "creator"]);
export const platformEnum = appSchema.enum("platform", platforms);
export const campaignStatusEnum = appSchema.enum(
  "campaign_status",
  campaignStatuses,
);
export const submissionStatusEnum = appSchema.enum(
  "submission_status",
  submissionStatuses,
);
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const users = appSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull(),
});

export const campaigns = appSchema.table(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    platforms: platformEnum("platforms").array().notNull(),
    payoutPer1kViewsCents: integer("payout_per_1k_views").notNull(),
    totalBudgetCents: integer("total_budget").notNull(),
    budgetAllocatedCents: integer("budget_allocated_cents")
      .notNull()
      .default(0),
    status: campaignStatusEnum("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    version: integer("version").notNull().default(1),
    nextApprovalOrder: integer("next_approval_order").notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    check("campaign_title", sql`length(trim(${t.title})) between 1 and 120`),
    check(
      "campaign_platforms",
      sql`cardinality(${t.platforms}) between 1 and 3`,
    ),
    check(
      "campaign_payout",
      sql`${t.payoutPer1kViewsCents} between 1 and ${sql.raw(String(MAX_VALUE))}`,
    ),
    check(
      "campaign_budget",
      sql`${t.totalBudgetCents} between 1 and ${sql.raw(String(MAX_VALUE))}`,
    ),
    check(
      "campaign_budget_ceiling",
      sql`${t.budgetAllocatedCents} >= 0 and ${t.budgetAllocatedCents} <= ${t.totalBudgetCents}`,
    ),
    check(
      "campaign_dates",
      sql`${t.startsAt} < ${t.endsAt} and ${t.endsAt} - ${t.startsAt} <= interval '366 days'`,
    ),
    index("campaign_status_period_idx").on(t.status, t.startsAt, t.endsAt),
  ],
);

export const submissions = appSchema.table(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    postUrl: text("post_url").notNull(),
    externalPostId: text("external_post_id").notNull(),
    platform: platformEnum("platform").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    allocatedEarningsCents: integer("allocated_earnings_cents")
      .notNull()
      .default(0),
    approvalOrder: integer("approval_order"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "string",
    }),
    ...timestamps(),
  },
  (t) => [
    unique("submission_post_unique").on(
      t.campaignId,
      t.platform,
      t.externalPostId,
    ),
    unique("submission_approval_order_unique").on(
      t.campaignId,
      t.approvalOrder,
    ),
    check(
      "submission_allocation",
      sql`${t.allocatedEarningsCents} between 0 and ${sql.raw(String(MAX_VALUE))}`,
    ),
    check(
      "submission_rejection_reason",
      sql`${t.status} <> 'rejected' or (${t.rejectionReason} is not null and length(trim(${t.rejectionReason})) > 0)`,
    ),
    index("submission_review_queue_idx").on(
      t.campaignId,
      t.status,
      t.createdAt,
      t.id,
    ),
    index("submission_creator_idx").on(t.creatorId, t.createdAt, t.id),
    index("submission_reviewer_idx").on(t.reviewedBy),
  ],
);

export const submissionMetrics = appSchema.table(
  "submission_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id),
    capturedAt: date("captured_at", { mode: "string" }).notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
  },
  (t) => [
    unique("metric_submission_day_unique").on(t.submissionId, t.capturedAt),
    check(
      "metric_counters",
      sql`${t.views} between 0 and ${sql.raw(String(MAX_VALUE))} and ${t.likes} between 0 and ${sql.raw(String(MAX_VALUE))} and ${t.comments} between 0 and ${sql.raw(String(MAX_VALUE))}`,
    ),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type User = typeof users.$inferSelect;
