import { safeCount, utcDay } from "@/features/shared";

export function summarizeMetrics(
  metrics: { submissionId: string; capturedAt: string; views: number }[],
  startsAt: string,
  endsAt: string,
) {
  const previous = new Map<string, number>();
  const increments = new Map<string, number>();
  for (const metric of [...metrics].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  )) {
    const delta = Math.max(
      0,
      metric.views - (previous.get(metric.submissionId) ?? 0),
    );
    previous.set(metric.submissionId, metric.views);
    increments.set(
      metric.capturedAt,
      safeCount((increments.get(metric.capturedAt) ?? 0) + delta),
    );
  }
  const start = new Date(`${utcDay(new Date(startsAt))}T00:00:00.000Z`);
  const end = Date.parse(endsAt);
  const dailyViews: { date: string; views: number }[] = [];
  for (let time = start.getTime(); time < end; time += 86_400_000) {
    const date = utcDay(new Date(time));
    dailyViews.push({ date, views: increments.get(date) ?? 0 });
  }
  return {
    totalApprovedViews: safeCount(
      [...previous.values()].reduce((sum, views) => sum + views, 0),
    ),
    dailyViews,
  };
}
