import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const cookieName = "wavy_session";
const sessionSchema = z.strictObject({
  userId: z.uuid(),
  expiresAt: z.number().int().positive(),
});
const maxAge = 7 * 24 * 60 * 60;

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionCookie(
  userId: string,
  secret: string,
  secure: boolean,
  now = new Date(),
) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: now.getTime() + maxAge * 1000 }),
  ).toString("base64url");
  return `${cookieName}=${payload}.${signature(payload, secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function readSessionUserId(
  cookieHeader: string | null,
  secret: string,
  now = new Date(),
): string | null {
  const token = /(?:^|;\s*)wavy_session=([^;]*)/.exec(cookieHeader ?? "")?.[1];
  if (!token || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, supplied] = parts;
  const expected = signature(payload, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
    return null;
  try {
    const session = sessionSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return session.success && session.data.expiresAt > now.getTime()
      ? session.data.userId
      : null;
  } catch {
    return null;
  }
}
