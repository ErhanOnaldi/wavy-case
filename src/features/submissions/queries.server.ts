import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { calculateEarnings } from "@/features/campaigns/rules";
import { pageResult, type Pagination } from "@/features/shared";
import type { Database } from "@/server/db";
import {
  campaigns,
  submissions,
  users,
  type Submission,
} from "@/server/db/schema";

export async function listSubmissions(
  db: Database,
  input: Pagination,
  scope:
    | { creatorId: string; status?: Submission["status"] }
    | { campaignId: string },
) {
  const isMine = "creatorId" in scope;
  const where: SQL | undefined = isMine
    ? and(
        eq(submissions.creatorId, scope.creatorId),
        scope.status ? eq(submissions.status, scope.status) : undefined,
      )
    : and(
        eq(submissions.campaignId, scope.campaignId),
        eq(submissions.status, "pending"),
      );
  return db.transaction(
    async (tx) => {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(submissions)
        .where(where);
      const items = await tx
        .select({
          id: submissions.id,
          campaignId: submissions.campaignId,
          campaignTitle: campaigns.title,
          postUrl: submissions.postUrl,
          platform: submissions.platform,
          status: submissions.status,
          rejectionReason: submissions.rejectionReason,
          createdAt: submissions.createdAt,
          allocatedEarningsCents: submissions.allocatedEarningsCents,
          creatorEmail: users.email,
          payoutPer1kViewsCents: campaigns.payoutPer1kViewsCents,
          latestViews:
            sql<number>`coalesce((select m.views from app.submission_metrics m where m.submission_id = ${submissions.id} order by m.captured_at desc limit 1), 0)`.mapWith(
              Number,
            ),
        })
        .from(submissions)
        .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
        .innerJoin(users, eq(users.id, submissions.creatorId))
        .where(where)
        .orderBy(
          isMine ? desc(submissions.createdAt) : asc(submissions.createdAt),
          isMine ? desc(submissions.id) : asc(submissions.id),
        )
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
      return pageResult(
        items.map((item) => ({
          ...item,
          estimatedEarningsCents:
            item.status === "rejected"
              ? 0
              : calculateEarnings(item.latestViews, item.payoutPer1kViewsCents),
        })),
        total,
        input,
      );
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
