import { initTRPC, TRPCError } from "@trpc/server";
import { z, ZodError } from "zod";
import { DomainError } from "@/features/errors";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message:
        error.code === "INTERNAL_SERVER_ERROR"
          ? "Something went wrong. Please try again."
          : shape.message,
      data: {
        ...shape.data,
        domainError:
          error.cause instanceof DomainError ? error.cause.data : null,
        fieldErrors:
          error.cause instanceof ZodError
            ? z.flattenError(error.cause).fieldErrors
            : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure.use(async ({ ctx, type, next }) => {
  if (
    type === "mutation" &&
    ctx.req.headers.get("origin") !== new URL(ctx.config.appUrl).origin
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Mutations must come from this application.",
    });
  }
  const result = await next();
  // tRPC middleware results wrap downstream errors rather than throwing them.
  if (!result.ok && result.error.cause instanceof DomainError) {
    const cause = result.error.cause;
    throw new TRPCError({
      code: cause.data.code === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT",
      message: cause.message,
      cause,
    });
  }
  return result;
});
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Choose a demo account to continue.",
    });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access is required.",
    });
  return next({ ctx });
});
export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "creator")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Creator access is required.",
    });
  return next({ ctx });
});
export const demoProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.config.canSwitchUser)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The user switcher is disabled.",
    });
  return next({ ctx });
});
