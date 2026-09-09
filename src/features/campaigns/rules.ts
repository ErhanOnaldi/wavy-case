import { MAX_VALUE } from "@/features/shared";

export function calculateEarnings(
  views: number,
  payoutPer1kViewsCents: number,
) {
  if (
    !Number.isInteger(views) ||
    views < 0 ||
    views > MAX_VALUE ||
    !Number.isInteger(payoutPer1kViewsCents) ||
    payoutPer1kViewsCents < 1 ||
    payoutPer1kViewsCents > MAX_VALUE
  ) {
    throw new RangeError("Invalid views or payout rate.");
  }
  return Math.floor(views / 1000) * payoutPer1kViewsCents;
}

export function isAccepting(
  campaign: { status: string; startsAt: string; endsAt: string },
  now: Date,
) {
  return (
    campaign.status === "active" &&
    Date.parse(campaign.startsAt) <= now.getTime() &&
    now.getTime() < Date.parse(campaign.endsAt)
  );
}
