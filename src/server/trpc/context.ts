import { eq } from "drizzle-orm";
import type { Database } from "@/server/db";
import { users } from "@/server/db/schema";
import { readSessionUserId } from "@/server/auth/session";

export type SessionConfig = {
  secret: string;
  appUrl: string;
  canSwitchUser: boolean;
  secure: boolean;
};

export async function createContext(options: {
  db: Database;
  req: Request;
  resHeaders: Headers;
  config: SessionConfig;
}) {
  const userId = readSessionUserId(
    options.req.headers.get("cookie"),
    options.config.secret,
  );
  const [user] = userId
    ? await options.db.select().from(users).where(eq(users.id, userId))
    : [];
  return { ...options, user: user ?? null };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
