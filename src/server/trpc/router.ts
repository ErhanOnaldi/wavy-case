import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { campaignRouter } from "@/features/campaigns/router";
import { submissionRouter } from "@/features/submissions/router";
import { demoUsers } from "@/server/auth/demo-users";
import { createSessionCookie } from "@/server/auth/session";
import { users } from "@/server/db/schema";
import { demoProcedure, publicProcedure, router } from "./init";

export const appRouter = router({
  session: router({
    me: publicProcedure.query(({ ctx }) => ({
      user: ctx.user,
      canSwitchUser: ctx.config.canSwitchUser,
    })),
    switchableUsers: demoProcedure.query(({ ctx }) =>
      ctx.db
        .select()
        .from(users)
        .where(
          inArray(
            users.id,
            demoUsers.map((user) => user.id),
          ),
        )
        .orderBy(users.role, users.email),
    ),
    switchUser: demoProcedure
      .input(z.strictObject({ userId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (!demoUsers.some((user) => user.id === input.userId))
          throw new TRPCError({ code: "FORBIDDEN" });
        const [user] = await ctx.db
          .select()
          .from(users)
          .where(eq(users.id, input.userId));
        if (!user)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Run the seed script to create the demo users.",
          });
        ctx.resHeaders.append(
          "Set-Cookie",
          createSessionCookie(user.id, ctx.config.secret, ctx.config.secure),
        );
        return user;
      }),
  }),
  campaign: campaignRouter,
  submission: submissionRouter,
});
export type AppRouter = typeof appRouter;
