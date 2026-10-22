# Architecture

## Overview

`contributor-tool-insights` is a two-process backend: an Express HTTP API and a BullMQ scan worker. Both connect to the same Postgres database and Redis instance. A future frontend (Vite app in `src/`) will call the API over HTTP.

```
┌─────────────┐        HTTP        ┌─────────────────┐
│  Frontend   │ ─────────────────▶ │  API (Express)  │
│  src/ (TBD) │ ◀───────────────── │  server/app.ts  │
└─────────────┘      JSON + JWT    └────────┬────────┘
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                        ┌──────────┐  ┌──────────┐  ┌──────────┐
                        │ Postgres │  │  Redis   │  │  GitHub  │
                        └────┬─────┘  └────┬─────┘  └────┬─────┘
                             │             │             │
                             │             │             │
                        ┌────▼─────────────▼─────────────▼────┐
                        │        Scan worker (BullMQ)          │
                        │   server/modules/scans/scan.worker   │
                        └──────────────────────────────────────┘
```

## Request lifecycle — scan

1. `POST /repos/:id/scan` → `requestScan()` in `server/modules/scans/scan.service.ts`
2. Cache check: `cache:scan-result:<repoId>` (1h TTL). Fresh → return `200 { scan, cached: true }`
3. In-flight check: `scans` row with `status IN ('pending','running')` for this repo → return that row, `cached: true`
4. Insert `scans` row (`status = 'pending'`) → enqueue BullMQ job keyed by scan id → return `202 { scan, cached: false }`
5. Worker picks up job → marks `status = 'running'` → fetches GitHub data → builds `ScanContext` → saves to `scan:context:<scanId>` (1h TTL) → runs 13 detectors → persists `tool_usage` rows → backfills `tracked_tools` → writes `scans.summary` → caches completed scan.
6. On failure → `status = 'failed'`, error text stored, scan-result cache invalidated, BullMQ retries up to 3 times with exponential backoff.

## Request lifecycle — metrics

1. `GET /repos/:id/metrics` → `getRepoMetrics()`
2. Latest completed scan for repo → cache key `cache:metrics:<repoId>:<scanId>` (60s TTL)
3. Cache miss → aggregate `tool_usage` + `tracked_tools` → compute `coverage × adoption` → write cache → return
4. New scan → new scan id → new cache key; old key expires naturally

## Data model

- **users** — GitHub identity + encrypted access token (AES-256-GCM)
- **repositories** — tracked repos; metadata synced from GitHub at add time
- **scans** — one row per scan request; status, timestamps, summary JSON
- **tool_usage** — one repo-level row per tool per scan (`contributor_login IS NULL`), plus one per-contributor row per tool per scan
- **tracked_tools** — user's curated set of tools per repo (`enabled` flag); scan worker backfills newly detected + relevant tools with `ON CONFLICT DO NOTHING` so user choices win
- **migrations** — applied migration ledger

Cascades: deleting a repo cascades to its `scans`, `tool_usage`, and `tracked_tools`.

## Redis keys

| Key | TTL | Purpose |
|-----|-----|---------|
| `scan:context:<scanId>` | 1h | Full scan context for detectors (commits, contributors, config files, workflows) |
| `cache:scan-result:<repoId>` | 1h from scan completion | Last completed scan; short-circuits `POST /repos/:id/scan` |
| `cache:metrics:<repoId>:<scanId>` | 60s | Latest computed metrics for a repo |
| `ratelimit:<name>:<identity>:<window>` | window + 1s | Fixed-window rate counter |
| `oauth:state:<state>` | 10m | OAuth CSRF state |

Redis is not a source of truth — everything cached here can be regenerated from Postgres and GitHub.

## Authentication

1. `GET /auth/github` → 32-byte random `state` stored in Redis (10m TTL) → redirect to GitHub authorize URL
2. `GET /auth/github/callback` → validate `state` (delete on match) → exchange code for token → fetch GitHub user + primary email → encrypt token → upsert `users` → sign JWT (`sub = user id`) → set `httpOnly` cookie → redirect to `FRONTEND_URL`
3. Protected routes → `requireAuth` middleware → read `token` cookie → verify HMAC (timing-safe) → attach `req.userId`
4. Every protected handler resolves the GitHub token via `getAccessTokenForUser(req.userId)` which decrypts at rest; decrypt failures are treated as "no token available" (worker fails the scan cleanly, user must re-authenticate)

## Scoring

`adoptionScore = coverage × adoption`, both 0–100:

- `coverage = detected tracked tools / tracked tools`
- `adoption = mean(adoptionRate of detected tracked tools that aren't commit-presence proxies)`
- Commit-presence proxies (`github-actions`, `dependabot`, `renovate`) are always reported but never count toward `adoption` — their per-contributor signal is "made a commit," which would inflate the score to 100 on any active repo.

When `tracked_tools` is empty (uncurated repo), scoring falls back to "everything detected and relevant" so a fresh repo doesn't score 0.