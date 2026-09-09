import { adminProcedure, creatorProcedure, router } from "@/server/trpc/init";
import {
  mySubmissionsSchema,
  rejectionSchema,
  reviewQueueSchema,
  reviewSchema,
  submissionFormSchema,
} from "./schemas";
import { createSubmission, reviewSubmission } from "./service.server";
import { listSubmissions } from "./queries.server";

export const submissionRouter = router({
  create: creatorProcedure
    .input(submissionFormSchema)
    .mutation(({ ctx, input }) => createSubmission(ctx.db, ctx.user.id, input)),
  listMine: creatorProcedure
    .input(mySubmissionsSchema)
    .query(({ ctx, input }) =>
      listSubmissions(ctx.db, input, {
        creatorId: ctx.user.id,
        status: input.status,
      }),
    ),
  reviewQueue: adminProcedure
    .input(reviewQueueSchema)
    .query(({ ctx, input }) =>
      listSubmissions(ctx.db, input, { campaignId: input.campaignId }),
    ),
  approve: adminProcedure
    .input(reviewSchema)
    .mutation(({ ctx, input }) =>
      reviewSubmission(ctx.db, ctx.user.id, input.submissionId, {
        status: "approved",
      }),
    ),
  reject: adminProcedure
    .input(rejectionSchema)
    .mutation(({ ctx, input }) =>
      reviewSubmission(ctx.db, ctx.user.id, input.submissionId, {
        status: "rejected",
        reason: input.reason,
      }),
    ),
});
