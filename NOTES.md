# Implementation notes

## Run locally

Requirements: Node 24 (see `.nvmrc`), Docker with Compose, and pnpm 10.34.5 (`npm install -g pnpm@10.34.5`).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Replace `SESSION_SECRET` in `.env` with the output of `openssl rand -hex 32`. Keep the other local defaults, then:

```sh
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000. The entry screen and account switcher provide two fictional admins and two creators. The seed is repeatable and preserves existing records; it does not reset reviews. PostgreSQL development data persists in a Docker volume. `docker compose down` stops the databases without deleting that volume.

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

Stop the dev server before `pnpm start`. Integration tests migrate and clear **only** the dedicated local `wavy_test` database on port 54330; they refuse remote URLs and the development URL. `pnpm test:unit` needs no database. CI supplies its own PostgreSQL service and runs the same checks.

```sh
pnpm ingest
pnpm ingest
```

Ingest prints inserted/skipped counts and individual failures. The second run on the same UTC day leaves successful records and allocations unchanged. Failed records can be retried. A run with any failure finishes the other records and exits nonzero. Newly submitted clips already have today's initial measurement, so they do not grow again that day. Seeded approved clips have historical measurements for an immediate demo.

Schema changes: edit `src/server/db/schema.ts`, run `pnpm db:generate`, review and commit the generated SQL and metadata, then run `pnpm db:migrate`. No schema push is required.

## Budget and concurrency

All amounts are integer cents. Earnings are `floor(latestViews / 1000) * rateCents`. Approval must reserve the entire calculated amount or return the typed `INSUFFICIENT_BUDGET` error with required and available cents. No partial initial approval.

**Assumption agreed during planning:** estimated earnings and reserved earnings are separate. Later view growth preserves the real counters but reserves only `min(earnings - alreadyReserved, remainingBudget)`. The campaign completes in that same transaction when its balance reaches zero. This avoids silently clipping views when the brief's formula grows beyond the budget. There is no actual payment transfer; “spent” means reserved.

Every campaign writer first locks the campaign row using `SELECT ... FOR UPDATE`: approval, rejection, submission creation, campaign edits and ingest. Approval re-reads the submission, latest metric and balance after acquiring that lock, then writes both the submission and campaign in one transaction. Competing requests are ordered by lock acquisition; network arrival order is not a FIFO guarantee. Independent campaigns can proceed concurrently. Database checks also reject negative/excess allocations; campaign edits use a version check to reject stale forms.

Ingest uses one transaction per campaign and a savepoint per submission, in approval order. A failed SQL statement rolls back its savepoint, allowing the other submissions to commit. The `(submission_id, captured_at)` unique constraint and locked same-day check prevent duplicates and repeated allocation. Counter growth is monotonic, including overlapping runs. External/fake provider work is performed before locking; no network work occurs under the lock. Lock timeout is five seconds, statement timeout fifteen seconds. Infrastructure failures are not disguised as budget failures or automatically retried.

The tests use independent PostgreSQL connections, hold a campaign lock, verify that both writers are waiting in `pg_stat_activity`, then release them. They cover competing approvals, approve/reject, budget edit/approval, approval/ingest and two ingest runs. A real failing SQL trigger verifies savepoint recovery; another verifies that an initial metric failure rolls back submission creation. Other tests cover payout boundaries, exact/excess budgets, ownership/roles, signed sessions, URL uniqueness, availability and chart gaps. The tRPC transport itself is tested for typed errors and mutation origin checks.

I ruled out process-local mutexes because they do not protect multiple server processes. Serializable isolation with retries and optimistic compare-and-swap are viable alternatives, but were not prototyped: the single shared campaign balance makes a short row lock simpler. No Redis, generic repository or separate application/domain projects.

## Other decisions and limits

- Feature folders hold shared schemas/pure rules, server queries/services, tRPC routers and components. Next.js handles routing; tRPC handles all browser application data. TanStack Query supplies typed query state/cache; Recharts supplies the daily chart. No REST data endpoints or Server Action alternative.
- Submission creation generates a deterministic fake initial metric in the same transaction. The creator cannot supply counters, ownership or review status. Canonical platform/post identity makes tracked and short URL variants duplicates within a campaign. We validate URL structure; no real social API fetch occurs.
- New submissions and approvals require `active` and `startsAt <= now < endsAt`. Existing approved clips continue ingesting after pause/end/completion. First submission locks platform/rate/dates; title and budget increases remain editable. Completed campaigns cannot reopen. UTC is the measurement day; forms display local dates. Campaign duration is capped at 366 days and individual monetary/counter inputs at 1 billion to bound charts and preserve exact arithmetic.
- Daily views are differences between cumulative observations, assigned to the observation date. Missing days are zero, not interpolated. Total approved views uses each clip's latest observation, never the sum of daily cumulative counts.
- **Demo exception to dev-only switching:** an explicit `DEMO_MODE=true` permits the allowlisted fictional accounts in the hosted production build so a reviewer can exercise both roles. Ordinary production defaults to disabled; the server procedures are also gated. Cookies contain a signed, expiring user ID; roles are read from the database. This is intentionally not real authentication.
- Deliberately omitted: real auth, real payments/mark-paid operation, social API integrations, job scheduler, realtime updates, submission editing/deletion, design customisation and coverage targets. `paid` exists in the schema for the brief; no payment feature is implied.
- With another day, I would add a persisted ingest-run audit with provider retry diagnostics, so an interrupted external sync can be investigated beyond the CLI report.

## Hosting

Use one Render Node web service for Next.js and tRPC, with Supabase PostgreSQL. GitHub holds the source; GitHub Pages cannot run this server application. `render.yaml` explicitly selects a free instance and manual deploys.

1. Create the Supabase project. Use its direct database connection, or the **session** pooler when IPv4 connectivity is needed; use TLS with certificate verification. Put the connection string in a private environment file; never commit it. Application tables live in the private `app` schema; do not add it to Data API exposed schemas. No Supabase browser SDK or service-role key is used.
2. With `DATABASE_URL` set privately to the hosted database, run `pnpm db:migrate` and `pnpm db:seed` once before enabling the live app. Migrations and seed are separate from builds/restarts. Render's free web service does not provide a paid pre-deploy command, so run migrations explicitly before subsequent manual deploys too.
3. Create a Blueprint from `render.yaml`. Supply `DATABASE_URL` and set `APP_URL` to the exact HTTPS service URL. The Blueprint generates `SESSION_SECRET`; leave `DEMO_MODE=true` only for fictional review data.
4. Deploy, then smoke-test both roles, submission/review and budget errors. Run `pnpm ingest` from a trusted machine with the hosted `DATABASE_URL` when needed. Do not point integration tests at Supabase.

Free hosting can sleep; allow the first request time to start. See [Render deployment commands](https://render.com/docs/deploys) and [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres).

## AI tooling

Codex assisted with planning, implementation, migrations, tests, UI checks and these notes. The human chose the estimated/reserved split and initial fake measurements. Corrections during implementation included mapping tRPC middleware's returned error result (rather than assuming `next()` throws), checking campaign time eligibility after the row lock, and separating unsupported-platform errors from locked campaign terms. Generated shadcn imports were adjusted to the project's `cn` helper; TypeScript was pinned to 5.9 for the selected Next 15 lint toolchain. Concurrency claims were checked against real PostgreSQL transactions rather than mocked repositories.
