# Local Development

## Prerequisites

- Node 20+
- Postgres 15+
- Redis 7+

## Option A — Docker (recommended on desktop)

```bash
docker compose up -d
```

This starts Postgres (`localhost:5432`) and Redis (`localhost:6379`) with health checks. `.env` should use:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/repo_insights
REDIS_URL=redis://localhost:6379
```

## Option B — Native install

### Linux (Debian/Ubuntu)

```bash
sudo apt install postgresql redis-server

sudo -u postgres psql -c "CREATE USER you WITH PASSWORD 'dev';"
sudo -u postgres createdb -O you repo_insights

sudo systemctl enable --now postgresql
sudo systemctl enable --now redis-server
```

`.env`:

```bash
DATABASE_URL=postgres://you:dev@localhost:5432/repo_insights
REDIS_URL=redis://localhost:6379
```

### macOS

```bash
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis

createdb repo_insights
```

`.env`:

```bash
DATABASE_URL=postgres://user@localhost:5432/repo_insights
REDIS_URL=redis://localhost:6379
```

### Termux (Android)

```bash
pkg install postgresql redis

mkdir -p $PREFIX/var/lib/postgresql
initdb $PREFIX/var/lib/postgresql

pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/logfile start
createdb repo_insights
redis-server --daemonize yes
```

`.env`:

```bash
DATABASE_URL=postgres://user@localhost:5432/repo_insights
REDIS_URL=redis://localhost:6379
```

On Termux, Postgres and Redis don't start automatically after a reboot. Either re-run the two start commands, or alias them in `~/.bashrc`:

```bash
alias startdb='pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/logfile start && redis-server --daemonize yes'
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | no (default `development`) | `development`, `production`, or `test` |
| `PORT` | no (default `3000`) | API listen port |
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Redis connection string |
| `GITHUB_CLIENT_ID` | yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | yes | GitHub OAuth app client secret |
| `GITHUB_CALLBACK_URL` | yes | Must match the OAuth app's callback URL exactly |
| `JWT_SECRET` | yes (32+ chars) | HMAC key for session tokens |
| `JWT_EXPIRES_IN` | no (default `7d`) | Accepts `3600`, `60s`, `5m`, `2h`, `7d` |
| `TOKEN_ENCRYPTION_KEY` | yes (64 hex chars) | AES-256-GCM key for GitHub access tokens at rest |
| `FRONTEND_URL` | yes | Redirect target after OAuth; also the CORS origin |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## GitHub OAuth app

1. Go to https://github.com/settings/developers → **New OAuth App**
2. **Homepage URL**: `http://localhost:5173`
3. **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
4. Leave **Allow wildcard matching** and **Enable Device Flow** unchecked
5. Leave **Expire user access tokens** unchecked
6. Copy the Client ID and generate a Client Secret into `.env`

## Migrations

```bash
npm run migrate
```

Re-running is a no-op. The `migrations` table in Postgres records what's applied.

## Run

```bash
npm run dev      # API on http://localhost:3000
npm run worker   # in a separate terminal
```

Both must be running for scan processing to work — the API only enqueues jobs; the worker executes them.

## Verify

```bash
curl -s http://localhost:3000/health
# → {"status":"ok",...}

npm run typecheck
npm test
```

## Running tests

```bash
npm test          # single run
npm run test:watch
npm run test:cov
```

Tests use the same Postgres and Redis as development. Each test truncates the DB before running. Do not point tests at a production database.

## Frontend

The frontend lives in `src/` and runs as a Vite app.

```bash
npm install             # one install at root covers backend + frontend
npm run dev:frontend    # http://localhost:5173
```

The Vite dev server proxies `/auth`, `/repos`, `/scans`, and `/health` to
the backend on `:3000`. Start the backend (`npm run dev`) in another
terminal.

Frontend scripts:

- `npm run dev:frontend` — Vite dev server
- `npm run build:frontend` — production build into `src/dist/`
- `npm run typecheck:frontend` — TypeScript check

shadcn components live in `src/src/components/ui/`. Add a new one with:

```bash
cd src && npx shadcn@latest add <component>
```
