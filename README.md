## contributor-tool-insights

An analytics platform for open-source maintainers and engineering teams that answers a question they've never had data for:

> **"Are our contributors actually using the tools we're asking them to use?"**

Connect a GitHub repository and get clear, per-tool adoption metrics — who's using ESLint, who's writing tests, who's bypassing CI — instead of guessing.

### Status

Backend MVP complete (Phases 0–10). Frontend in progress.

- [x] GitHub OAuth
- [x] Repository tracking
- [x] Scan pipeline (BullMQ worker)
- [x] 13 tool detectors (JS/TS, Python, Go, PHP + CI + dependency automation)
- [x] Metrics aggregation with per-repo tool selection
- [x] Scan + metrics caching, rate limiting
- [x] Unit + integration tests
- [ ] Frontend dashboard
- [ ] Benchmarking, Slack, API access

### Repository layout

```
server/     Backend — Express API + BullMQ worker
src/        Frontend — Vite app (in progress)
tests/      Vitest unit + integration tests
scripts/    Migration runner and dev utilities
docs/       Architecture, API reference, detector details, build log
```

### Quickstart

```bash
npm install
cp .env.example .env    # fill in DATABASE_URL, REDIS_URL, GitHub OAuth keys, JWT + encryption secrets
npm run migrate
npm run dev             # API on http://localhost:3000
npm run worker          # in a separate terminal — BullMQ scan worker
```

See [`docs/local-development.md`](docs/local-development.md) for Postgres/Redis setup (native or Docker).

### Documentation

- [`docs/architecture.md`](docs/architecture.md) — system overview
- [`docs/detectors.md`](docs/detectors.md) — the 13 tools we detect and how
- [`docs/api.md`](docs/api.md) — HTTP API reference
- [`docs/build-log.md`](docs/build-log.md) — phase-by-phase build history
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute

### License

MIT — see [`LICENSE`](LICENSE).