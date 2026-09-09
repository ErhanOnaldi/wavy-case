import "server-only";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createDatabase } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { createContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const globalDatabase = globalThis as typeof globalThis & {
  wavyDatabase?: ReturnType<typeof createDatabase>;
};

async function handler(req: Request) {
  const env = getServerEnv();
  const { db } = (globalDatabase.wavyDatabase ??= createDatabase(
    env.DATABASE_URL,
  ));
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ resHeaders }) => {
      resHeaders.set("Cache-Control", "private, no-store");
      resHeaders.set("Vary", "Cookie");
      return createContext({
        db,
        req,
        resHeaders,
        config: {
          secret: env.SESSION_SECRET,
          appUrl: env.APP_URL,
          canSwitchUser:
            process.env.NODE_ENV === "development" || env.DEMO_MODE === "true",
          secure: new URL(env.APP_URL).protocol === "https:",
        },
      });
    },
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR")
        console.error("tRPC operation failed", {
          path,
          name: error.cause?.name,
        });
    },
  });
}
export { handler as GET, handler as POST };
