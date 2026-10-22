# Detectors

Detectors run once per scan, inside the BullMQ worker, against a single `ScanContext`. They return a `DetectionResult` that becomes one or more `tool_usage` rows.

## Interface

```typescript
interface ToolDetector {
  name: string;
  category: ToolCategory;
  detect(ctx: ScanContext): Promise<DetectionResult>;
}
```

`ScanContext` carries everything a detector should need — no additional GitHub calls:

- `commits` — up to 300 recent commits on the default branch; first 30 include per-file diffs
- `contributors` — up to 200 contributors with contribution counts
- `rootFiles` — file names at the repository root
- `configFiles` — a map of path → text content for selected config files
- `workflowFiles` — paths under `.github/workflows/`

A detector must not import from `server/integrations/` or make network calls. Everything must come from `ctx`.

## Result shape

```typescript
type DetectionResult = {
  tool: string;
  category: ToolCategory;
  detected: boolean;
  adoptionRate: number;      // 0–100, two decimals
  evidence: {
    configFiles?: string[];
    dependencyFiles?: string[];
    ciWorkflows?: string[];
    commits?: string[];
  };
  perContributor?: Record<string, boolean>;
};
```

`detected` is "is this tool configured for this repo." `adoptionRate` is "what fraction of contributors show a signal of using it." Both are written to `tool_usage`: one row with `contributor_login IS NULL` (repo-level) and one row per contributor (`adoption_rate = 100` or `0`).

## Registry

`server/modules/tools/detector.registry.ts` exports a flat array. Order doesn't matter functionally but the array is the single source of truth for the `/repos/:id/tracked-tools` endpoint and the `toolsChecked` count in metrics. Adding a detector requires one import + one array entry.

## Current detectors (13)

| Tool | Category | Detection signals |
|------|----------|-------------------|
| jest | testing | `jest.config.*`, `jest` in `package.json` deps or scripts, `jest`/`npm test` in workflows |
| eslint | linting | `.eslintrc.*`, `eslint.config.*`, `eslint` dep, `eslint` in workflows |
| prettier | linting | `.prettierrc.*`, `prettier.config.*`, `prettier` dep, `prettier` in workflows |
| pytest | testing | `pytest.ini`, `tox.ini`, `setup.cfg [tool:pytest]`, `pyproject.toml [tool.pytest]`, `pytest` in requirements/setup, `pytest` in workflows |
| black | linting | `pyproject.toml [tool.black]`, `setup.cfg [tool:black]`, `black` in requirements/setup/tox, `black` in workflows |
| ruff | linting | `ruff.toml`, `.ruff.toml`, `pyproject.toml [tool.ruff]`, `ruff` in requirements, `ruff` in workflows |
| pre-commit | linting | `.pre-commit-config.yaml`, `pre-commit` in workflows |
| github-actions | ci_cd | any file under `.github/workflows/` |
| dependabot | dependencies | `.github/dependabot.yml` or `.yaml` |
| renovate | dependencies | `renovate.json(.5)`, `.renovaterc(.json)`, `.github/renovate.*`, `renovate` in `package.json` |
| go-test | testing | gated on Go project (`go.mod` or `.go` files); `_test.go` in commits or `go test` in workflows |
| golangci-lint | linting | `.golangci.{yml,yaml,toml,json}` or `golangci-lint` in workflows; gated on Go |
| phpunit | testing | `phpunit.xml(.dist)` or `phpunit/phpunit` in `composer.json`; gated on PHP |

## Per-contributor attribution caveats

Every detector except `github-actions`, `dependabot`, and `renovate` uses **file-touch attribution**: "did this contributor touch a file in the tool's category in the fetched commit window?"

This is a proxy, not proof. A contributor could touch a `.py` file without running `black`. A contributor could touch a `.ts` file without running `eslint`. The attribution is a **behaviour signal**, not evidence of tool execution.

`github-actions`, `dependabot`, and `renovate` don't have a meaningful per-contributor signal (there is no "contributor ran CI locally"), so their per-contributor rows are set to "made a commit in the window." These three are excluded from `adoptionScore` via `countsTowardScore: false` in the metrics response.

When a signal isn't present at all for a detector, the whole detector is excluded from the score denominator — a Python-only repo doesn't get penalised for missing `jest`.

## Language gating

`go-test`, `golangci-lint`, and `phpunit` suppress themselves entirely on repos with no Go/PHP signals. Their `detected` is `false`, `perContributor` is `{}`. Metrics also flags them with `relevant: false`.

JS and Python detectors use a softer approach — they stay relevant if their language is detected, but their per-contributor count is populated for every contributor regardless of language. A JS-only repo will show `pytest` as `relevant: false` (so the UI can dim it) but still populate its per-contributor rows.

## Adding a new detector

See `CONTRIBUTING.md#adding-a-detector`. Key steps:

1. New file in `server/modules/tools/detectors/`
2. Implement `ToolDetector`
3. Register in `detector.registry.ts`
4. Unit tests in `tests/unit/detectors/` covering: config positive, dependency positive, workflow positive, negative, per-contributor attribution
5. If the detector needs a config file that isn't in the fetch list, add to `CONFIG_FILE_CANDIDATES` or `CONFIG_SUBDIR_CANDIDATES` in `server/modules/scans/scan.worker.ts`