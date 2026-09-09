import { adminProcedure, creatorProcedure, router } from "@/server/trpc/init";
import {
  campaignIdSchema,
  idSchema,
  paginationSchema,
} from "@/features/shared";
import {
  campaignFormSchema,
  campaignListSchema,
  campaignStatusSchema,
  campaignUpdateSchema,
} from "./schemas";
import { campaignOverview, getCampaign, listCampaigns } from "./queries.server";
import {
  createCampaign,
  setCampaignStatus,
  updateCampaign,
} from "./service.server";

export const campaignRouter = router({
  list: adminProcedure
    .input(campaignListSchema)
    .query(({ ctx, input }) => listCampaigns(ctx.db, input)),
  get: adminProcedure
    .input(idSchema)
    .query(({ ctx, input }) => getCampaign(ctx.db, input.id)),
  create: adminProcedure
    .input(campaignFormSchema)
    .mutation(({ ctx, input }) => createCampaign(ctx.db, input)),
  update: adminProcedure
    .input(campaignUpdateSchema)
    .mutation(({ ctx, input }) => updateCampaign(ctx.db, input)),
  setStatus: adminProcedure
    .input(campaignStatusSchema)
    .mutation(({ ctx, input }) => setCampaignStatus(ctx.db, input)),
  overview: adminProcedure
    .input(campaignIdSchema)
    .query(({ ctx, input }) => campaignOverview(ctx.db, input.campaignId)),
  browse: creatorProcedure
    .input(paginationSchema.strict())
    .query(({ ctx, input }) => listCampaigns(ctx.db, input, true)),
  getAvailable: creatorProcedure
    .input(idSchema)
    .query(({ ctx, input }) => getCampaign(ctx.db, input.id, true)),
});
