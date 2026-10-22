# API Reference

Base URL: `http://localhost:3000` in development.

All routes except `/health` and `/auth/github*` require an authenticated session. Authentication uses an `httpOnly` cookie named `token`, set by `GET /auth/github/callback`.

Every response includes an `X-Request-Id` header. Error responses include `requestId` in the body so client-side logs and server-side logs can be correlated.

## Errors

All errors have the shape:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Not authenticated",
    "details": {},
    "requestId": "uuid"
  }
}
```

Known codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `INVALID_JSON`, `RATE_LIMITED`, `INTERNAL_ERROR`, `VALIDATION_ERROR`.

Rate-limited responses also include `Retry-After` and `X-RateLimit-*` headers.

## Health

### `GET /health`

No auth, no rate limit.

```json
{ "status": "ok", "service": "contributor-tool-insights", "time": "2026-01-01T00:00:00.000Z" }
```

## Auth

### `GET /auth/github`

Redirects to GitHub's authorize URL. Sets a `state` value in Redis (10m TTL) for CSRF protection.

### `GET /auth/github/callback?code=…&state=…`

Exchanges the OAuth code, upserts the user, sets the JWT cookie, redirects to `FRONTEND_URL`. `state` is one-time-use — replay returns `400 BAD_REQUEST`.

### `GET /auth/me`

Requires auth.

```json
{
  "user": {
    "id": "uuid",
    "githubId": 123,
    "username": "octocat",
    "email": "octocat@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/u/123"
  }
}
```

### `POST /auth/logout`

Requires auth. Clears the cookie.

```json
{ "ok": true }
```

## Repositories

### `GET /repos/github`

Requires auth. Lists repos the user owns, collaborates on, or has contributed to in an org. Org repos where the user has never committed are excluded.

```json
{
  "repos": [
    {
      "id": 123,
      "name": "hello-world",
      "full_name": "octocat/hello-world",
      "owner": { "login": "octocat" },
      "private": false,
      "default_branch": "main",
      "stargazers_count": 5,
      "forks_count": 1
    }
  ]
}
```

### `POST /repos`

Requires auth.

Body:

```json
{ "githubId": 123 }
```

Response `201`:

```json
{
  "repository": {
    "id": "uuid",
    "githubId": 123,
    "owner": "octocat",
    "name": "hello-world",
    "fullName": "octocat/hello-world",
    "isPrivate": false,
    "defaultBranch": "main",
    "stars": 5,
    "forks": 1,
    "contributorCount": 3,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Errors: `400 BAD_REQUEST` if `githubId` isn't accessible or already tracked is a `409 CONFLICT`.

### `GET /repos`

Requires auth. Lists tracked repos.

### `GET /repos/:id`

Requires auth. Returns one tracked repo.

## Scans

### `POST /repos/:id/scan`

Requires auth. Rate-limited to 10/min.

- **`202 Accepted`** — new scan queued. Body: `{ scan: {...}, cached: false }`
- **`200 OK`** — either a fresh cached scan (< 1h old) or a pending/running scan already exists. Body: `{ scan: {...}, cached: true }`

Scan shape:

```json
{
  "scan": {
    "id": "uuid",
    "repoId": "uuid",
    "status": "pending" | "running" | "complete" | "failed",
    "startedAt": null,
    "completedAt": null,
    "error": null,
    "summary": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "cached": false
}
```

### `GET /repos/:id/scans`

Requires auth. Last 50 scans, newest first.

### `GET /scans/:scanId`

Requires auth. Single scan, includes `summary` once complete.

## Metrics

### `GET /repos/:id/metrics`

Requires auth. Rate-limited to 120/min. Cached for 60s per `(repoId, latest scan)`.

```json
{
  "repoId": "uuid",
  "repoFullName": "octocat/hello-world",
  "scanId": "uuid",
  "scanCompletedAt": "2026-01-01T00:00:00.000Z",
  "adoptionScore": 62.5,
  "coverage": 71.43,
  "adoption": 87.5,
  "languages": ["js"],
  "toolsChecked": 13,
  "toolsRelevant": 7,
  "toolsTracked": 5,
  "toolsDetected": 4,
  "tools": [
    {
      "name": "jest",
      "category": "testing",
      "detected": true,
      "relevant": true,
      "tracked": true,
      "adoptionRate": 87.5,
      "contributorCount": 8,
      "contributorsUsing": 7,
      "countsTowardScore": true,
      "evidence": { "configFiles": ["jest.config.js"] }
    }
  ]
}
```

`coverage` and `adoption` are also 0–100. `adoptionScore = coverage × adoption / 100`. See `docs/architecture.md#scoring`.

Repos with no completed scan return a well-shaped empty response (`scanId: null`, `tools: []`, `adoptionScore: 0`).

## Tracked tools

### `GET /repos/:id/tracked-tools`

Requires auth. Returns all 13 registry tools with their current state for this repo.

```json
{
  "repoId": "uuid",
  "tools": [
    {
      "toolName": "jest",
      "enabled": true,
      "detected": true,
      "relevant": true,
      "category": "testing"
    }
  ]
}
```

### `PUT /repos/:id/tracked-tools`

Requires auth. Full replacement of the user's tracked set.

```json
{
  "tools": [
    { "name": "jest", "enabled": true },
    { "name": "eslint", "enabled": false }
  ]
}
```

Tools not mentioned in the body are deleted. Unknown tool names → `400 BAD_REQUEST`.