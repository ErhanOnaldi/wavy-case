CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "app"."platform" AS ENUM('tiktok', 'instagram', 'youtube');--> statement-breakpoint
CREATE TYPE "app"."user_role" AS ENUM('admin', 'creator');--> statement-breakpoint
CREATE TYPE "app"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TABLE "app"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"platforms" "app"."platform"[] NOT NULL,
	"payout_per_1k_views" integer NOT NULL,
	"total_budget" integer NOT NULL,
	"budget_allocated_cents" integer DEFAULT 0 NOT NULL,
	"status" "app"."campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_approval_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_title" CHECK (length(trim("app"."campaigns"."title")) between 1 and 120),
	CONSTRAINT "campaign_platforms" CHECK (cardinality("app"."campaigns"."platforms") between 1 and 3),
	CONSTRAINT "campaign_payout" CHECK ("app"."campaigns"."payout_per_1k_views" between 1 and 1000000000),
	CONSTRAINT "campaign_budget" CHECK ("app"."campaigns"."total_budget" between 1 and 1000000000),
	CONSTRAINT "campaign_budget_ceiling" CHECK ("app"."campaigns"."budget_allocated_cents" >= 0 and "app"."campaigns"."budget_allocated_cents" <= "app"."campaigns"."total_budget"),
	CONSTRAINT "campaign_dates" CHECK ("app"."campaigns"."starts_at" < "app"."campaigns"."ends_at" and "app"."campaigns"."ends_at" - "app"."campaigns"."starts_at" <= interval '366 days')
);
--> statement-breakpoint
CREATE TABLE "app"."submission_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"captured_at" date NOT NULL,
	"views" integer NOT NULL,
	"likes" integer NOT NULL,
	"comments" integer NOT NULL,
	CONSTRAINT "metric_submission_day_unique" UNIQUE("submission_id","captured_at"),
	CONSTRAINT "metric_counters" CHECK ("app"."submission_metrics"."views" between 0 and 1000000000 and "app"."submission_metrics"."likes" between 0 and 1000000000 and "app"."submission_metrics"."comments" between 0 and 1000000000)
);
--> statement-breakpoint
CREATE TABLE "app"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"post_url" text NOT NULL,
	"external_post_id" text NOT NULL,
	"platform" "app"."platform" NOT NULL,
	"status" "app"."submission_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"allocated_earnings_cents" integer DEFAULT 0 NOT NULL,
	"approval_order" integer,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_post_unique" UNIQUE("campaign_id","platform","external_post_id"),
	CONSTRAINT "submission_approval_order_unique" UNIQUE("campaign_id","approval_order"),
	CONSTRAINT "submission_allocation" CHECK ("app"."submissions"."allocated_earnings_cents" between 0 and 1000000000),
	CONSTRAINT "submission_rejection_reason" CHECK ("app"."submissions"."status" <> 'rejected' or ("app"."submissions"."rejection_reason" is not null and length(trim("app"."submissions"."rejection_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "app"."user_role" NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app"."submission_metrics" ADD CONSTRAINT "submission_metrics_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "app"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_status_period_idx" ON "app"."campaigns" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "submission_review_queue_idx" ON "app"."submissions" USING btree ("campaign_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "submission_creator_idx" ON "app"."submissions" USING btree ("creator_id","created_at","id");--> statement-breakpoint
CREATE INDEX "submission_reviewer_idx" ON "app"."submissions" USING btree ("reviewed_by");