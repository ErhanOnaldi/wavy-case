import { createHash } from "node:crypto";
import { MAX_VALUE } from "@/features/shared";

export type MetricCounts = { views: number; likes: number; comments: number };
function hash(value: string) {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

export function initialMetric(postIdentity: string): MetricCounts {
  const views = 1500 + (hash(postIdentity) % 18_500);
  return {
    views,
    likes: Math.floor(views / 20),
    comments: Math.floor(views / 100),
  };
}

export function dailyIncrement(
  submissionId: string,
  day: string,
): MetricCounts {
  const views = 500 + (hash(`${submissionId}:${day}`) % 4500);
  return {
    views,
    likes: Math.floor(views / 20),
    comments: Math.floor(views / 100),
  };
}

export function addIncrement(
  previous: MetricCounts,
  increment: MetricCounts,
): MetricCounts {
  for (const count of Object.values(increment)) {
    if (!Number.isInteger(count) || count < 0 || count > MAX_VALUE)
      throw new Error("Invalid metric increment.");
  }
  return {
    views: Math.min(MAX_VALUE, previous.views + increment.views),
    likes: Math.min(MAX_VALUE, previous.likes + increment.likes),
    comments: Math.min(MAX_VALUE, previous.comments + increment.comments),
  };
}
