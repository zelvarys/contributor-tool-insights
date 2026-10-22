# Contributing to repo-tool-insights

Thanks for taking the time to contribute.

## Ways to contribute

- **Bug reports** — open an issue with reproduction steps
- **New detectors** — the most useful contribution right now; see `docs/detectors.md`
- **Language support** — detectors for Rust, Ruby, Java, Kotlin, C# are welcome
- **Frontend work** — the dashboard is being built; watch for issues tagged `frontend`
- **Docs** — typo fixes, clarifications, examples

## Development setup

1. Install Node 20+, Postgres 15+, Redis 7+
2. `npm install`
3. `cp .env.example .env` and fill in the required values
4. `npm run migrate`
5. `npm run dev` (API) and `npm run worker` (in a second terminal)
6. `npm test` to confirm everything is green

Full details in `docs/local-development.md`.

## Adding a detector

1. Read `docs/detectors.md` — the interface and expectations are documented
2. Create `server/modules/tools/detectors/<tool>.detector.ts`
3. Implement `ToolDetector` — `name`, `category`, `detect(ctx)`
4. Register in `server/modules/tools/detector.registry.ts`
5. Add unit tests in `tests/unit/detectors/<tool>.detector.test.ts` — cover:
   config-file positive, dependency positive, workflow positive, negative,
   per-contributor attribution
6. If the tool needs a config file that isn't in the fetch list, add the
   path to `CONFIG_FILE_CANDIDATES` or `CONFIG_SUBDIR_CANDIDATES` in
   `server/modules/scans/scan.worker.ts`
7. Open a PR — CI runs typecheck, migrations, and tests

## Commit conventions

Conventional Commits. Examples:

- `feat(detectors): add Rust Clippy detector`
- `fix(metrics): handle empty tracked_tools correctly`
- `docs(api): document /repos/:id/metrics response shape`
- `test(phase10): add pytest detector coverage`

## Code style

- TypeScript strict mode, ESM, `.js` extensions in imports
- No new runtime dependencies without discussion — we're deliberately lean
- Prefer hand-written validators over pulling in a schema library
- Every endpoint change must update `docs/api.md` and have an integration test

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Detector additions include unit tests
- [ ] Endpoint additions are documented in `docs/api.md`
- [ ] No new runtime dependencies unless justified