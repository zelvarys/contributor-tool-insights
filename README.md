## contributor-tool-insights

An analytics platform for open-source maintainers and engineering teams that answers a question they have never had data for: "Are our contributors actually using the tools we are asking them to use?" It connects to GitHub repositories, analyses contributor behaviour across commits, pull requests and configuration files, and generates actionable insights about which development tools are being adopted, and which are being actively avoided.

---

### Build Plan — Phase by Phase

Each phase is a self-contained, testable milestone. Do not move to the next phase until the current one passes its acceptance test.

---

### Phase 0 — Project Skeleton ✅

**Goal:** A running Express server with `/health` that returns `{ status: 'ok' }`.

**Files created:**

```
package.json
tsconfig.json
.env / .env.example
.gitignore
src/server.ts
src/app.ts
src/config/env.ts
src/utils/logger.ts
src/utils/errors.ts
src/middleware/error.middleware.ts
```

**Acceptance test:**

```bash
npm run dev
curl http://localhost:3000/health
# → {"status":"ok"}
```

**Status:** COMPLETE

---

### Phase 1 — Docker + Database ✅

**Goal:** Postgres + Redis running locally, schema applied via migrations.

**Files created:**

```
docker-compose.yml
src/config/database.ts
src/config/redis.ts
src/db/migrations/001_init.sql
scripts/migrate.js
```

**Acceptance test:**

```bash
docker compose up -d
npm run migrate
psql $DATABASE_URL -c "\dt"
# → users, repositories, scans, tool_usage
```

**Status:** COMPLETE

---

### Phase 2 — GitHub OAuth ✅

**Goal:** A real user can log in via GitHub and receive a JWT cookie.

**Files created:**

```
src/utils/jwt.ts
src/utils/crypto.ts
src/integrations/github/github.oauth.ts
src/integrations/github/github.client.ts
src/integrations/github/github.types.ts
src/modules/auth/auth.service.ts
src/modules/auth/auth.controller.ts
src/modules/auth/auth.routes.ts
src/middleware/auth.middleware.ts
```

**Acceptance test:**

```
1. Visit http://localhost:3000/auth/github → redirected to GitHub
2. Authorise → redirected to FRONTEND_URL
3. Cookie `token` is set
4. curl http://localhost:3000/me -b "token=..." → returns user JSON
5. psql: SELECT * FROM users; → row exists
```

**Status:** COMPLETE

---

### Phase 3 — Repository Module ✅

**Goal:** Authenticated user can list their GitHub repos and add one to tracking.

**Files created:**

```
src/modules/repositories/repository.controller.ts
src/modules/repositories/repository.service.ts
src/modules/repositories/repository.routes.ts
src/modules/repositories/repository.schema.ts
```

**Acceptance test:**

```
GET  /repos/github       → list of the user's GitHub repos (with metadata)
POST /repos              → body { githubId } → inserts into repositories table
GET  /repos              → list of tracked repos
GET  /repos/:id          → detail of one repo
```

**Status:** COMPLETE

---

### Phase 4 — Scan Queue (No Detectors Yet) ✅

**Goal:** `POST /repos/:id/scan` enqueues a BullMQ job; a worker picks it up and writes a `scans` row with `status='complete'`.

**Files created:**

```
src/modules/scans/scan.queue.ts
src/modules/scans/scan.service.ts
src/modules/scans/scan.controller.ts
src/modules/scans/scan.routes.ts
src/modules/scans/scan.worker.ts
```

**Acceptance test:**

```bash
npm run dev          # in one terminal
npm run worker       # in another terminal

curl -X POST http://localhost:3000/repos/<id>/scan -b "token=..."
# → { scanId: "..." }

sleep 3
psql $DATABASE_URL -c "SELECT status FROM scans ORDER BY created_at DESC LIMIT 1;"
# → complete
```

**Status:** COMPLETE

---

### Phase 5 — GitHub Data Fetching ✅

**Goal:** The worker fetches real commit history + contributors + config files for a repo and stores them (temporarily, in Redis) so detectors can use them.

**Files modified:**

```
src/integrations/github/github.client.ts   # add fetchCommitHistory, fetchContributors
src/modules/scans/scan.worker.ts           # call fetchers, cache result
```

**Acceptance test:**

```bash
curl -X POST .../scan → worker runs
redis-cli KEYS "scan:context:*"
# → shows cached commit history for the repo
```

**Status:** COMPLETE

---

### Phase 6 — First Detector (Jest) ✅

**Goal:** Jest detector runs during a scan and writes a `tool_usage` row.

**Files created:**

```
src/modules/tools/detector.interface.ts
src/modules/tools/detector.registry.ts
src/modules/tools/detectors/jest.detector.ts
```

**Files modified:**

```
src/modules/scans/scan.worker.ts   # invoke registry
```

**Acceptance test:**

```bash
curl -X POST .../scan
psql $DATABASE_URL -c "SELECT tool_name, detected, adoption_rate FROM tool_usage;"
# → jest | true | 62.50
```

**Status:** COMPLETE

---

### Phase 7 — Remaining Detectors ✅

**Goal:** ESLint, pytest, Black, GitHub Actions, and other detectors all work.

**Files created:**

```
src/modules/tools/detectors/eslint.detector.ts
src/modules/tools/detectors/pytest.detector.ts
src/modules/tools/detectors/black.detector.ts
src/modules/tools/detectors/github-actions.detector.ts
.......
```

**Acceptance test:** Run a scan on 3 different real repos (JS, Python, mixed) and verify each detector produces sensible `detected` / `adoption_rate` values.

**Status:** COMPLETE

---

### Phase 8 — Metrics Aggregation ✅

**Goal:** `GET /repos/:id/metrics` returns the current adoption score and per-tool breakdown.

**Files created:**

```
src/modules/metrics/metrics.controller.ts
src/modules/metrics/metrics.service.ts
src/modules/metrics/metrics.routes.ts
```

**Acceptance test:**

```bash
curl http://localhost:3000/repos/<id>/metrics -b "token=..."
# → {
#     "adoptionScore": 74,
#     "tools": [
#       { "name": "jest", "category": "testing", "adoptionRate": 62.5 },
#       ...
#     ]
#   }
```

**Status:** COMPLETE

---

### Phase 9 — Caching + Rate Limit Guard ✅

**Goal:** Repo scans are cached; repeated scans within 1 hour return cached results. GitHub rate-limit headers respected.

**Files created:**

```
src/utils/cache.ts
src/middleware/rate-limit.middleware.ts
```

**Files modified:**

```
src/integrations/github/github.client.ts
src/modules/scans/scan.service.ts
```

**Acceptance test:**

- Two rapid scans produce one GitHub API hit (verify in logs).
- Trigger 100 requests → 429 after threshold.

**Status:** COMPLETE

---

### Phase 10 — Hardening + Tests 

**Goal:** Unit tests for detectors, integration tests for auth and the scan pipeline, per-request IDs, and structured JSON errors.

**Files created:**

```
vitest.config.ts
tests/helpers/context.ts
tests/helpers/db.ts
tests/unit/jwt.test.ts
tests/unit/crypto.test.ts
tests/unit/detectors/jest.detector.test.ts
tests/unit/detectors/eslint.detector.test.ts
tests/unit/detectors/pytest.detector.test.ts
tests/integration/auth.test.ts
tests/integration/scan.test.ts
```

**Files modified:**

```
src/modules/scans/scan.worker.ts
src/middleware/error.middleware.ts
src/app.ts
package.json
```

**Acceptance test:**

```bash
npm test
# → all suites green
npm run typecheck
# → silent
```

**Status:** NOT STARTED