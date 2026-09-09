import { parseMoney } from "@/lib/format";
import { describe, expect, test } from "vitest";
import { calculateEarnings } from "@/features/campaigns/rules";
import { campaignFormSchema } from "@/features/campaigns/schemas";
import { summarizeMetrics } from "@/features/metrics/summary";
import { parsePostUrl } from "@/features/submissions/url";
import { rejectionSchema } from "@/features/submissions/schemas";
import { createSessionCookie, readSessionUserId } from "@/server/auth/session";

describe("payout math", () => {
  test.each([
    [0, 0],
    [999, 0],
    [1000, 125],
    [1999, 125],
    [2000, 250],
  ])("%i views earns %i cents", (views, expected) => {
    expect(calculateEarnings(views, 125)).toBe(expected);
  });
  test("keeps the maximum supported multiplication exact", () => {
    expect(calculateEarnings(1_000_000_000, 1_000_000_000)).toBe(
      1_000_000_000_000_000,
    );
  });
  test.each([-1, 1.5, Number.NaN, 1_000_000_001])(
    "rejects invalid views %s",
    (views) => {
      expect(() => calculateEarnings(views, 125)).toThrow(RangeError);
    },
  );
});

describe("post identity", () => {
  test("YouTube URL variants identify the same post", () => {
    const canonical = parsePostUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(parsePostUrl("https://youtu.be/dQw4w9WgXcQ?si=tracking")).toEqual(
      canonical,
    );
    expect(
      parsePostUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ#share"),
    ).toEqual(canonical);
  });
  test.each([
    "https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@attacker.example/watch?v=dQw4w9WgXcQ",
    "https://attacker@youtube.com/watch?v=dQw4w9WgXcQ",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=bad",
    "https://www.instagram.com/creator/",
    "https://vm.tiktok.com/abcdef/",
    "javascript:alert(1)",
  ])("rejects unsupported or misleading URL %s", (url) =>
    expect(parsePostUrl(url)).toBeNull(),
  );
  test("accepts post paths on the other campaign platforms", () => {
    expect(
      parsePostUrl("https://www.tiktok.com/@creator/video/7400000000000000001")
        ?.platform,
    ).toBe("tiktok");
    expect(
      parsePostUrl("https://www.instagram.com/reel/Abc12345/?utm_source=test")
        ?.externalPostId,
    ).toBe("Abc12345");
  });
});

test("chart uses changes, fills missing days, and totals only latest snapshots", () => {
  const result = summarizeMetrics(
    [
      { submissionId: "a", capturedAt: "2026-01-01", views: 1000 },
      { submissionId: "a", capturedAt: "2026-01-03", views: 1600 },
      { submissionId: "b", capturedAt: "2026-01-03", views: 500 },
    ],
    "2026-01-01T00:00:00Z",
    "2026-01-05T00:00:00Z",
  );
  expect(result.totalApprovedViews).toBe(2100);
  expect(result.dailyViews.map((point) => point.views)).toEqual([
    1000, 0, 1100, 0,
  ]);
});

test("chart uses an earlier baseline without including it in the displayed period", () => {
  expect(
    summarizeMetrics(
      [
        { submissionId: "a", capturedAt: "2025-12-31", views: 1000 },
        { submissionId: "a", capturedAt: "2026-01-01", views: 1600 },
      ],
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z",
    ).dailyViews,
  ).toEqual([{ date: "2026-01-01", views: 600 }]);
});

test("shared schemas reject empty reasons and reversed dates", () => {
  expect(
    rejectionSchema.safeParse({
      submissionId: "00000000-0000-4000-8000-000000000001",
      reason: "   ",
    }).success,
  ).toBe(false);
  expect(
    campaignFormSchema.safeParse({
      title: "Test",
      platforms: ["youtube"],
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 1000,
      startsAt: "2026-01-02T00:00:00Z",
      endsAt: "2026-01-01T00:00:00Z",
    }).success,
  ).toBe(false);
});

test("signed sessions reject tampering, wrong secrets and expiry", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const now = new Date("2026-01-01T00:00:00Z");
  const secret = "unit-test-secret-at-least-32-characters";
  const cookie = createSessionCookie(id, secret, true, now);
  expect(readSessionUserId(cookie, secret, now)).toBe(id);
  expect(cookie).toContain("HttpOnly; SameSite=Lax");
  expect(cookie).toContain("; Secure");
  expect(
    readSessionUserId(
      cookie.replace("wavy_session=", "wavy_session=x"),
      secret,
      now,
    ),
  ).toBeNull();
  expect(readSessionUserId(cookie, "different-secret", now)).toBeNull();
  expect(
    readSessionUserId(cookie, secret, new Date("2026-01-08T00:00:00Z")),
  ).toBeNull();
});

test("dollar inputs convert to integer cents without rounding extra decimals", () => {
  expect(parseMoney("1.2")).toBe(120);
  expect(parseMoney("0.29")).toBe(29);
  expect(parseMoney("500")).toBe(50000);
  expect(parseMoney("1.234")).toBeNaN();
  expect(parseMoney("")).toBeNaN();
});
