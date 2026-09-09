import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "@/server/db";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
  type Campaign,
} from "@/server/db/schema";
import { createSessionCookie } from "@/server/auth/session";
import { demoUsers } from "@/server/auth/demo-users";
import { createContext, type SessionConfig } from "@/server/trpc/context";
import { appRouter, type AppRouter } from "@/server/trpc/router";
import { ingestMetrics } from "@/features/metrics/ingest.server";
import { utcDay } from "@/features/shared";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "TEST_DATABASE_URL is required. Copy .env.example and run docker compose up -d --wait.",
  );
const connectionUrl = new URL(connectionString);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    connectionUrl.hostname,
  ) ||
  connectionUrl.pathname !== "/wavy_test"
) {
  throw new Error(
    "Integration tests only run against a local database named wavy_test.",
  );
}
if (connectionString === process.env.DATABASE_URL)
  throw new Error("Test and development databases must be separate.");
const { db, pool } = createDatabase(connectionString, "wavy-tests");
const config: SessionConfig = {
  secret: "integration-only-secret-32-characters",
  appUrl: "http://localhost:3000",
  canSwitchUser: true,
  secure: false,
};

async function caller(
  userIndex: number | null,
  extraConfig: Partial<SessionConfig> = {},
) {
  const cookie =
    userIndex === null
      ? ""
      : createSessionCookie(demoUsers[userIndex].id, config.secret, false);
  const ctx = await createContext({
    db,
    config: { ...config, ...extraConfig },
    resHeaders: new Headers(),
    req: new Request(`${config.appUrl}/api/trpc`, {
      headers: { cookie, origin: config.appUrl },
    }),
  });
  return appRouter.createCaller(ctx);
}

async function campaign(values: Partial<typeof campaigns.$inferInsert> = {}) {
  const now = Date.now();
  const [result] = await db
    .insert(campaigns)
    .values({
      title: "Test campaign",
      platforms: ["youtube", "tiktok"],
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 1000,
      status: "active",
      startsAt: new Date(now - 10 * 86_400_000).toISOString(),
      endsAt: new Date(now + 10 * 86_400_000).toISOString(),
      ...values,
    })
    .returning();
  return result;
}

async function submission(parent: Campaign, views = 7000, creatorIndex = 2) {
  const [result] = await db
    .insert(submissions)
    .values({
      campaignId: parent.id,
      creatorId: demoUsers[creatorIndex].id,
      postUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      platform: "youtube",
      externalPostId: randomUUID(),
    })
    .returning();
  await db.insert(submissionMetrics).values({
    submissionId: result.id,
    views,
    likes: 0,
    comments: 0,
    capturedAt: utcDay(new Date(Date.now() - 86_400_000)),
  });
  return result;
}

async function assertAccounting(id: string) {
  const [parent] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id));
  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.campaignId, id));
  expect(parent.budgetAllocatedCents).toBe(
    rows.reduce((sum, item) => sum + item.allocatedEarningsCents, 0),
  );
  expect(parent.budgetAllocatedCents).toBeLessThanOrEqual(
    parent.totalBudgetCents,
  );
  return parent;
}

async function state() {
  return {
    campaigns: await db.select().from(campaigns).orderBy(campaigns.id),
    submissions: await db.select().from(submissions).orderBy(submissions.id),
    metrics: await db
      .select()
      .from(submissionMetrics)
      .orderBy(submissionMetrics.id),
  };
}

// Two real transactions are held at the campaign lock before either may continue.
async function race<T>(id: string, operations: (() => Promise<T>)[]) {
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM app.campaigns WHERE id = $1 FOR UPDATE", [
    id,
  ]);
  const results = Promise.allSettled(
    operations.map((operation) => operation()),
  );
  try {
    await vi.waitFor(
      async () => {
        const waiting = await pool.query(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'wavy-tests' AND wait_event_type = 'Lock'",
        );
        expect(waiting.rows[0].count).toBe(operations.length);
      },
      { timeout: 3000, interval: 20 },
    );
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  return results;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});
beforeEach(async () => {
  await db.execute(sql`drop function if exists app.fail_one_metric() cascade`);
  await db.execute(
    sql`truncate app.submission_metrics, app.submissions, app.campaigns, app.users`,
  );
  await db.insert(users).values(demoUsers);
});
afterAll(async () => {
  await pool.end();
});

describe("budget and reviews", () => {
  test("uses the latest snapshot and completes an exactly exhausted campaign", async () => {
    const parent = await campaign();
    const clip = await submission(parent, 4000);
    await db.insert(submissionMetrics).values({
      submissionId: clip.id,
      capturedAt: utcDay(new Date()),
      views: 10_000,
      likes: 0,
      comments: 0,
    });
    const result = await (
      await caller(0)
    ).submission.approve({ submissionId: clip.id });
    expect(result).toMatchObject({
      allocatedEarningsCents: 1000,
      budgetLeftCents: 0,
      campaignStatus: "completed",
    });
    await assertAccounting(parent.id);
  });

  test("an approval one cent over budget rolls back without changing any rows", async () => {
    const parent = await campaign({ totalBudgetCents: 699 });
    const clip = await submission(parent);
    const before = await state();
    await expect(
      (await caller(0)).submission.approve({ submissionId: clip.id }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      cause: {
        data: {
          code: "INSUFFICIENT_BUDGET",
          requiredCents: 700,
          availableCents: 699,
        },
      },
    });
    expect(await state()).toEqual(before);
  });

  test("two admins cannot approve against the same insufficient shared budget", async () => {
    const parent = await campaign();
    const a = await submission(parent);
    const b = await submission(parent);
    const adminA = await caller(0),
      adminB = await caller(1);
    const results = await race(parent.id, [
      () => adminA.submission.approve({ submissionId: a.id }),
      () => adminB.submission.approve({ submissionId: b.id }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({
      reason: {
        cause: { data: { code: "INSUFFICIENT_BUDGET", availableCents: 300 } },
      },
    });
    expect((await assertAccounting(parent.id)).status).toBe("active");
  });

  test("repeated and competing review decisions cannot allocate twice", async () => {
    const parent = await campaign({ totalBudgetCents: 2000 });
    const clip = await submission(parent);
    const admin = await caller(0);
    const results = await race(parent.id, [
      () => admin.submission.approve({ submissionId: clip.id }),
      () =>
        admin.submission.reject({
          submissionId: clip.id,
          reason: "Not aligned with the brief.",
        }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { cause: { data: { code: "SUBMISSION_ALREADY_REVIEWED" } } },
    });
    await assertAccounting(parent.id);
  });

  test("two approvals of the same submission reserve its earnings only once", async () => {
    const parent = await campaign({ totalBudgetCents: 2000 });
    const clip = await submission(parent);
    const adminA = await caller(0),
      adminB = await caller(1);
    const results = await race(parent.id, [
      () => adminA.submission.approve({ submissionId: clip.id }),
      () => adminB.submission.approve({ submissionId: clip.id }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { cause: { data: { code: "SUBMISSION_ALREADY_REVIEWED" } } },
    });
    expect((await assertAccounting(parent.id)).budgetAllocatedCents).toBe(700);
  });

  test("a budget edit and approval share the lock without losing either allocation or version", async () => {
    const parent = await campaign();
    const clip = await submission(parent);
    const admin = await caller(0);
    const results = await race<unknown>(parent.id, [
      () =>
        admin.campaign.update({
          id: parent.id,
          expectedVersion: parent.version,
          title: parent.title,
          platforms: parent.platforms,
          payoutPer1kViewsCents: parent.payoutPer1kViewsCents,
          totalBudgetCents: 1400,
          startsAt: new Date(parent.startsAt).toISOString(),
          endsAt: new Date(parent.endsAt).toISOString(),
        }),
      () => admin.submission.approve({ submissionId: clip.id }),
    ]);
    expect(results[1].status).toBe("fulfilled");
    const updated = await assertAccounting(parent.id);
    expect(updated.budgetAllocatedCents).toBe(700);
    if (results[0].status === "fulfilled") {
      expect(updated).toMatchObject({ totalBudgetCents: 1400, version: 3 });
    } else {
      expect(results[0]).toMatchObject({
        reason: { cause: { data: { code: "STALE_CAMPAIGN" } } },
      });
      expect(updated).toMatchObject({ totalBudgetCents: 1000, version: 2 });
    }
  });

  test("campaign edits cannot change financial terms once submissions exist", async () => {
    const parent = await campaign();
    await submission(parent);
    const admin = await caller(0);
    const fields = {
      id: parent.id,
      expectedVersion: parent.version,
      title: parent.title,
      platforms: parent.platforms,
      payoutPer1kViewsCents: parent.payoutPer1kViewsCents,
      totalBudgetCents: parent.totalBudgetCents,
      startsAt: new Date(parent.startsAt).toISOString(),
      endsAt: new Date(parent.endsAt).toISOString(),
    };
    await expect(
      admin.campaign.update({ ...fields, payoutPer1kViewsCents: 200 }),
    ).rejects.toMatchObject({
      cause: { data: { code: "CAMPAIGN_TERMS_LOCKED" } },
    });
    await admin.campaign.update({ ...fields, title: "Updated title" });
    await expect(admin.campaign.update(fields)).rejects.toMatchObject({
      cause: { data: { code: "STALE_CAMPAIGN" } },
    });
  });
});

describe("access and submit", () => {
  test("every admin procedure rejects a creator and every app query requires a session", async () => {
    const parent = await campaign();
    const clip = await submission(parent);
    const creator = await caller(2),
      anonymous = await caller(null);
    const form = {
      title: "Campaign",
      platforms: ["youtube" as const],
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 1000,
      startsAt: new Date(parent.startsAt).toISOString(),
      endsAt: new Date(parent.endsAt).toISOString(),
    };
    const calls = [
      () => creator.campaign.list({}),
      () => creator.campaign.get({ id: parent.id }),
      () => creator.campaign.overview({ campaignId: parent.id }),
      () => creator.campaign.create(form),
      () =>
        creator.campaign.update({ ...form, id: parent.id, expectedVersion: 1 }),
      () =>
        creator.campaign.setStatus({
          id: parent.id,
          expectedVersion: 1,
          status: "paused",
        }),
      () => creator.submission.reviewQueue({ campaignId: parent.id }),
      () => creator.submission.approve({ submissionId: clip.id }),
      () =>
        creator.submission.reject({ submissionId: clip.id, reason: "forged" }),
    ];
    for (const call of calls)
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(anonymous.submission.listMine({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymous.campaign.browse({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("creator lists are scoped and forged ownership is rejected", async () => {
    const parent = await campaign();
    const a = await submission(parent, 1000, 2);
    await submission(parent, 2000, 3);
    const creator = await caller(2);
    expect(
      (await creator.submission.listMine({})).items.map((item) => item.id),
    ).toEqual([a.id]);
    const forged = { page: 1, creatorId: demoUsers[3].id };
    await expect(creator.submission.listMine(forged)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      creator.submission.create({
        campaignId: parent.id,
        postUrl: "https://youtu.be/dQw4w9WgXcQ",
        ...{ creatorId: demoUsers[3].id, views: 1 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await db
      .update(campaigns)
      .set({ status: "draft" })
      .where(eq(campaigns.id, parent.id));
    await expect(
      creator.campaign.getAvailable({ id: parent.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await creator.submission.listMine({})).items).toHaveLength(1);
  });

  test("the server creates the initial metric and duplicate URL variants cannot both be inserted", async () => {
    const parent = await campaign({ totalBudgetCents: 100_000 });
    const creatorA = await caller(2),
      creatorB = await caller(3);
    const results = await Promise.allSettled([
      creatorA.submission.create({
        campaignId: parent.id,
        postUrl: "https://youtu.be/dQw4w9WgXcQ?si=track",
      }),
      creatorB.submission.create({
        campaignId: parent.id,
        postUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { cause: { data: { code: "DUPLICATE_SUBMISSION" } } },
    });
    const before = await state();
    expect(before.metrics).toHaveLength(1);
    expect(before.metrics[0].views).toBeGreaterThan(1000);
    expect(before.campaigns[0].budgetAllocatedCents).toBe(0);
    await (
      await caller(0)
    ).submission.approve({ submissionId: before.submissions[0].id });
    const approved = await state();
    await ingestMetrics(db);
    expect(await state()).toEqual(approved);
  });

  test("a failed initial metric rolls back the entire submission", async () => {
    const parent = await campaign();
    await db.execute(
      sql`create function app.fail_one_metric() returns trigger language plpgsql as $$ begin raise exception 'initial metric failure'; end $$`,
    );
    await db.execute(
      sql`create trigger fail_metric before insert on app.submission_metrics for each row execute function app.fail_one_metric()`,
    );
    const before = await state();
    await expect(
      (await caller(2)).submission.create({
        campaignId: parent.id,
        postUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(await state()).toEqual(before);
  });

  test("a real post on an unsupported platform is rejected", async () => {
    const parent = await campaign({ platforms: ["tiktok"] });
    await expect(
      (await caller(2)).submission.create({
        campaignId: parent.id,
        postUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).rejects.toMatchObject({
      cause: { data: { code: "PLATFORM_NOT_ALLOWED" } },
    });
    expect((await state()).submissions).toHaveLength(0);
  });

  test("creator visibility and writes require an active campaign inside its period", async () => {
    const active = await campaign();
    const hidden = await Promise.all([
      campaign({ status: "draft" }),
      campaign({ status: "paused" }),
      campaign({ startsAt: new Date(Date.now() + 86_400_000).toISOString() }),
      campaign({ endsAt: new Date(Date.now() - 86_400_000).toISOString() }),
    ]);
    const creator = await caller(2);
    expect(
      (await creator.campaign.browse({})).items.map((item) => item.id),
    ).toEqual([active.id]);
    for (const parent of hidden) {
      await expect(
        creator.campaign.getAvailable({ id: parent.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        creator.submission.create({
          campaignId: parent.id,
          postUrl: "https://youtu.be/dQw4w9WgXcQ",
        }),
      ).rejects.toMatchObject({
        cause: { data: { code: "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS" } },
      });
    }
  });

  test("admin search and status filtering happen before server pagination", async () => {
    await campaign({ title: "100% Coffee A" });
    await campaign({ title: "100% Coffee B" });
    await campaign({ title: "100% Coffee draft", status: "draft" });
    await campaign({ title: "100 percent Coffee" });
    const admin = await caller(0);
    const input = { search: "100%", status: "active" as const, pageSize: 1 };
    const first = await admin.campaign.list({ ...input, page: 1 });
    const second = await admin.campaign.list({ ...input, page: 2 });
    expect(first).toMatchObject({ totalItems: 2, totalPages: 2 });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0].id).not.toBe(second.items[0].id);
  });

  test("empty rejection reasons fail at the shared server schema", async () => {
    const parent = await campaign(),
      clip = await submission(parent);
    await expect(
      (await caller(0)).submission.reject({
        submissionId: clip.id,
        reason: "  ",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await state()).submissions[0].status).toBe("pending");
  });

  test("switcher is server-gated and a role change is read from the database", async () => {
    const disabled = await caller(2, { canSwitchUser: false });
    await expect(
      disabled.session.switchUser({ userId: demoUsers[0].id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(disabled.session.switchableUsers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await db
      .update(users)
      .set({ role: "creator" })
      .where(eq(users.id, demoUsers[0].id));
    await expect((await caller(0)).campaign.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("ingest", () => {
  test("repeated and concurrent daily syncs leave metrics and budget unchanged", async () => {
    const parent = await campaign({ totalBudgetCents: 10_000 }),
      clip = await submission(parent, 1000);
    await (await caller(0)).submission.approve({ submissionId: clip.id });
    const results = await race(parent.id, [
      () => ingestMetrics(db),
      () => ingestMetrics(db),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const before = await state();
    expect(before.metrics).toHaveLength(2);
    const repeated = await ingestMetrics(db);
    expect(repeated).toMatchObject({ inserted: 0, skipped: 1, failures: [] });
    expect(await state()).toEqual(before);
    await ingestMetrics(db, { now: new Date(Date.now() + 86_400_000) });
    const rows = await db
      .select()
      .from(submissionMetrics)
      .orderBy(submissionMetrics.capturedAt);
    expect(rows).toHaveLength(3);
    expect(rows[2].views).toBeGreaterThanOrEqual(rows[1].views);
    await assertAccounting(parent.id);
  });

  test("growth respects the ceiling without clipping real views, in approval order", async () => {
    const parent = await campaign();
    const first = await submission(parent, 4000),
      second = await submission(parent, 4000);
    const admin = await caller(0);
    await admin.submission.approve({ submissionId: first.id });
    await admin.submission.approve({ submissionId: second.id });
    const result = await ingestMetrics(db, {
      increment: () => ({ views: 10_000, likes: 0, comments: 0 }),
    });
    expect(result).toMatchObject({ inserted: 2, failures: [] });
    const current = await assertAccounting(parent.id);
    expect(current).toMatchObject({
      status: "completed",
      budgetAllocatedCents: 1000,
    });
    const list = await (await caller(2)).submission.listMine({});
    expect(list.items.find((item) => item.id === first.id)).toMatchObject({
      latestViews: 14_000,
      estimatedEarningsCents: 1400,
      allocatedEarningsCents: 600,
    });
    expect(
      list.items.find((item) => item.id === second.id)?.allocatedEarningsCents,
    ).toBe(400);
  });

  test("one SQL failure rolls back only its savepoint; other submissions commit", async () => {
    const parent = await campaign({ totalBudgetCents: 10_000 });
    const bad = await submission(parent, 1000),
      good = await submission(parent, 1000);
    const admin = await caller(0);
    await admin.submission.approve({ submissionId: bad.id });
    await admin.submission.approve({ submissionId: good.id });
    await db.execute(
      sql`create function app.fail_one_metric() returns trigger language plpgsql as $$ begin if NEW.comments = 7654321 then raise exception 'test record failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger fail_metric before insert on app.submission_metrics for each row execute function app.fail_one_metric()`,
    );
    const result = await ingestMetrics(db, {
      increment: (id) => ({
        views: 2000,
        likes: 0,
        comments: id === bad.id ? 7654321 : 0,
      }),
    });
    expect(result.inserted).toBe(1);
    expect(result.failures).toEqual([
      {
        submissionId: bad.id,
        message: "Metric could not be saved; this submission was rolled back.",
      },
    ]);
    expect(
      await db
        .select()
        .from(submissionMetrics)
        .where(eq(submissionMetrics.submissionId, bad.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(submissionMetrics)
        .where(eq(submissionMetrics.submissionId, good.id)),
    ).toHaveLength(2);
    await assertAccounting(parent.id);
  });

  test("approval and ingest cannot overspend when they overlap", async () => {
    const parent = await campaign();
    const existing = await submission(parent, 4000),
      pending = await submission(parent, 5000);
    const admin = await caller(0);
    await admin.submission.approve({ submissionId: existing.id });
    const results = await race<unknown>(parent.id, [
      () => admin.submission.approve({ submissionId: pending.id }),
      () =>
        ingestMetrics(db, {
          increment: () => ({ views: 10_000, likes: 0, comments: 0 }),
        }),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    await assertAccounting(parent.id);
  });
});

test("real tRPC transport carries typed budget errors and rejects cross-origin mutations", async () => {
  const parent = await campaign({ totalBudgetCents: 699 }),
    clip = await submission(parent);
  const cookie = createSessionCookie(demoUsers[0].id, config.secret, false);
  let origin = config.appUrl;
  const client = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${config.appUrl}/api/trpc`,
        headers: () => ({ cookie, origin }),
        fetch: (url, init) =>
          fetchRequestHandler({
            endpoint: "/api/trpc",
            req: new Request(url, init),
            router: appRouter,
            createContext: ({ req, resHeaders }) =>
              createContext({ db, req, resHeaders, config }),
          }),
      }),
    ],
  });
  try {
    await client.submission.approve.mutate({ submissionId: clip.id });
    throw new Error("Expected rejection.");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<AppRouter>).data?.domainError).toEqual({
      code: "INSUFFICIENT_BUDGET",
      requiredCents: 700,
      availableCents: 699,
    });
  }
  origin = "https://unrelated.example";
  await expect(
    client.session.switchUser.mutate({ userId: demoUsers[0].id }),
  ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
});
