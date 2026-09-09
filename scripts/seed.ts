import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/server/db";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
  type Campaign,
} from "../src/server/db/schema";
import { demoUsers } from "../src/server/auth/demo-users";
import { calculateEarnings } from "../src/features/campaigns/rules";
import { utcDay } from "../src/features/shared";

const mainCampaignId = "10000000-0000-4000-8000-000000000001";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const { db, pool } = createDatabase(process.env.DATABASE_URL, "wavy-seed");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values(demoUsers).onConflictDoNothing();
      const [existing] = await tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.id, mainCampaignId));
      if (existing) {
        console.log(
          "Demo data already exists; existing activity was preserved.",
        );
        return;
      }
      const now = new Date();
      const atDay = (offset: number) =>
        new Date(now.getTime() + offset * 86_400_000).toISOString();
      const titles = [
        "Everyday moments, extraordinary coffee",
        "The last $10 — budget demo",
        "Your city, through a new lens",
        "Small rituals. Better mornings.",
        "Made for the long way home",
        "A fresh take on everyday style",
        "Soundtrack to your weekend",
        "The next chapter",
        "Summer stories, saved",
      ];
      const parents: Campaign[] = [];
      for (let i = 0; i < titles.length; i++) {
        const [parent] = await tx
          .insert(campaigns)
          .values({
            id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
            title: titles[i],
            platforms:
              i === 1
                ? ["youtube"]
                : i % 2
                  ? ["instagram", "tiktok"]
                  : ["youtube", "tiktok", "instagram"],
            payoutPer1kViewsCents: i === 1 ? 100 : 150 + i * 25,
            totalBudgetCents: i === 1 ? 1000 : 50_000 + i * 10_000,
            status: i === 7 ? "draft" : i === 8 ? "paused" : "active",
            startsAt: atDay(-7),
            endsAt: atDay(21),
            createdAt: new Date(now.getTime() - i * 60_000).toISOString(),
          })
          .returning();
        parents.push(parent);
      }
      const clips = [
        {
          campaign: parents[0],
          creator: 2,
          status: "approved" as const,
          postId: "dQw4w9WgXcQ",
          views: [3400, 8100, 12_800],
        },
        {
          campaign: parents[0],
          creator: 3,
          status: "approved" as const,
          postId: "aqz-KE-bpKQ",
          views: [1900, 5200, 9600],
        },
        {
          campaign: parents[0],
          creator: 2,
          status: "pending" as const,
          postId: "ScMzIvxBSi4",
          views: [6700],
        },
        {
          campaign: parents[0],
          creator: 3,
          status: "pending" as const,
          postId: "jNQXAC9IVRw",
          views: [3200],
        },
        {
          campaign: parents[0],
          creator: 2,
          status: "rejected" as const,
          postId: "M7lc1UVf-VE",
          views: [2100],
        },
        {
          campaign: parents[1],
          creator: 2,
          status: "pending" as const,
          postId: "dQw4w9WgXcQ",
          views: [7000],
        },
        {
          campaign: parents[1],
          creator: 3,
          status: "pending" as const,
          postId: "aqz-KE-bpKQ",
          views: [7000],
        },
      ];
      let order = 0;
      let allocated = 0;
      for (const clip of clips) {
        const approved = clip.status === "approved";
        const cents = approved
          ? calculateEarnings(
              clip.views.at(-1)!,
              clip.campaign.payoutPer1kViewsCents,
            )
          : 0;
        allocated += cents;
        const [submission] = await tx
          .insert(submissions)
          .values({
            campaignId: clip.campaign.id,
            creatorId: demoUsers[clip.creator].id,
            postUrl: `https://www.youtube.com/watch?v=${clip.postId}`,
            externalPostId: clip.postId,
            platform: "youtube",
            status: clip.status,
            allocatedEarningsCents: cents,
            approvalOrder: approved ? ++order : null,
            rejectionReason:
              clip.status === "rejected"
                ? "Please include the product within the first five seconds."
                : null,
            reviewedBy: clip.status !== "pending" ? demoUsers[0].id : null,
            reviewedAt: clip.status !== "pending" ? atDay(-6) : null,
            createdAt: atDay(-6),
          })
          .returning();
        for (let i = 0; i < clip.views.length; i++) {
          const views = clip.views[i];
          await tx
            .insert(submissionMetrics)
            .values({
              submissionId: submission.id,
              capturedAt: utcDay(
                new Date(atDay(approved ? [-6, -4, -1][i] : 0)),
              ),
              views,
              likes: Math.floor(views / 20),
              comments: Math.floor(views / 100),
            });
        }
      }
      await tx
        .update(campaigns)
        .set({ budgetAllocatedCents: allocated, nextApprovalOrder: order + 1 })
        .where(eq(campaigns.id, mainCampaignId));
      console.log(
        "Created 4 demo users, 9 campaigns and 7 submissions with daily metrics.",
      );
    });
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Seed failed. Check database connectivity and run migrations first.",
  );
  process.exitCode = 1;
});
