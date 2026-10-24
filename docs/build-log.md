# Build Log

Phase-by-phase history of how `repo-insights` was built. Each phase was a self-contained, testable milestone with its own acceptance test. Kept as engineering documentation for future contributors.

---

## Phase 0 — Project Skeleton 

Express server with `/health` returning `{ status: 'ok' }`.

Files: `package.json`, `tsconfig.json`, `.env(.example)`, `.gitignore`, `server/{server,app}.ts`, `server/config/env.ts`, `server/utils/logger.ts`, `server/utils/errors.ts`, `server/middleware/error.middleware.ts`.

---

## Phase 1 — Postgres + Redis + Migrations 

Postgres and Redis running locally, schema applied via a migration runner.

Files: `server/config/database.ts`, `server/config/redis.ts`, `server/db/migrations/001_initial_schema.sql`, `scripts/migrate.js`.

---

## Phase 2 — GitHub OAuth 

User logs in via GitHub, receives a JWT cookie, GitHub access token encrypted at rest with AES-256-GCM.

Files: `server/utils/jwt.ts`, `server/utils/crypto.ts`, `server/integrations/github/*`, `server/modules/auth/*`, `server/middleware/auth.middleware.ts`.

---

## Phase 3 — Repository Module 

List GitHub repos, add to tracking, list tracked repos, get one. Org-repo filter excludes repos the user has never contributed to.

Files: `server/modules/repositories/*`.

---

## Phase 4 — Scan Queue 

`POST /repos/:id/scan` enqueues a BullMQ job; worker writes `scans` rows.

Files: `server/modules/scans/scan.{queue,service,controller,routes,worker}.ts`.

---

## Phase 5 — GitHub Data Fetching 

Worker fetches commits, contributors, config files, workflow listings and caches them in Redis as `scan:context:<scanId>` with 1h TTL.

Files: `server/modules/scans/scan.context.ts`; extended `server/integrations/github/github.client.ts` and `server/modules/scans/scan.worker.ts`.

---

## Phase 6 — First Detector (Jest) + GraphQL N+1 Fix 

Jest detector writes `tool_usage` rows. Replaced org-repo N+1 REST filter with a single GraphQL `commitContributionsByRepository` query.

Files: `server/modules/tools/detector.{interface,registry}.ts`, `server/modules/tools/detectors/jest.detector.ts`.

---

## Phase 7 — Remaining Detectors 

Twelve more detectors, 13 total: eslint, prettier, pytest, black, ruff, pre-commit, github-actions, dependabot, renovate, go-test, golangci-lint, phpunit.

Files: `server/modules/tools/detectors/*.detector.ts`; extended `scan.worker.ts` config candidate lists.

---

## Phase 8 — Metrics Aggregation 

`GET /repos/:id/metrics` returns adoption score, coverage, adoption, per-tool breakdown, per-contributor counts, language list.

Composite formula: `coverage × adoption`, where:

- `coverage = detected tracked / tracked`
- `adoption = mean(adoptionRate of detected tracked tools that aren't commit-presence proxies)`

Commit-presence proxies (`github-actions`, `dependabot`, `renovate`) are reported but excluded from the score.

Files: `server/modules/metrics/*`.

---

## Phase 8b — User-Curated Tracked Tools 

`tracked_tools` table. `GET/PUT /repos/:id/tracked-tools`. Scan worker backfills newly detected + relevant tools (user choices win). Metrics scores against the user's tracked set; falls back to detected+relevant when uncurated.

Files: `server/db/migrations/002_tracked_tools.sql`, `server/modules/tracked-tools/*`.

---

## Phase 9 — Caching + Rate Limiting 

- Scan cache: 1h TTL, keyed by repoId; `cached: true` on fresh hits
- Metrics cache: 60s TTL, keyed by `repoId + scanId` — a new scan naturally busts
- In-flight scan dedup: `pending`/`running` short-circuits
- Rate limiting: 300/min global, 10/min scan, 120/min metrics; fails open on Redis errors

Files: `server/utils/cache.ts`, `server/middleware/rate-limit.middleware.ts`; extended scan/metrics services.

---

## Phase 10 — Hardening + Tests 

Vitest unit tests (jwt, crypto, 3 detectors), supertest integration tests (auth, scan pipeline), `attachRequestId` middleware, `INVALID_JSON` 400 handling.

Files: `vitest.config.ts`, `tests/**/*.test.ts`, `tests/helpers/*`; extended `error.middleware.ts` and `scan.worker.ts` (`processScanJobForTests`).

---

## Monorepo refactor 

`src/` moved to `server/`. Frontend directory `src/` created and waiting for Vite. Docs moved into `docs/`. CI workflow added.

---

## Frontend F0 — Scaffold ✅

Vite 6 + React 18 + TypeScript + Tailwind v4 + shadcn/ui (Neutral).
`src/` is a workspace. Vite proxy forwards `/auth`, `/repos`, `/scans`,
`/health` to `:3000`. Aliases: `@/*` → `src/src`, `@shared/*` → `shared`.
