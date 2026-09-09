import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.url(),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
});

export function getServerEnv() {
  const result = schema.safeParse({
    ...process.env,
    APP_URL: process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL,
  });
  if (!result.success)
    throw new Error(
      `Missing or invalid server environment: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  return result.data;
}
