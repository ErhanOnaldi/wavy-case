import { eq, sql } from "drizzle-orm";
import { DomainError } from "@/features/errors";
import type { Transaction } from ".";
import { campaigns } from "./schema";

// Every campaign writer uses this lock before reading mutable campaign/submission state.
export async function lockCampaign(tx: Transaction, id: string) {
  await tx.execute(sql`set local lock_timeout = '5s'`);
  const [campaign] = await tx
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .for("update");
  if (!campaign) throw new DomainError({ code: "NOT_FOUND" });
  return campaign;
}
