import { pool } from '../../config/database.js';
import { getTrackedRepository } from '../repositories/repository.service.js';

export type ToolMetric = {
  name: string;
  category: string;
  detected: boolean;
  relevant: boolean;
  adoptionRate: number;
  contributorCount: number;
  contributorsUsing: number;
  countsTowardScore: boolean;
  evidence: Record<string, unknown> | null;
};

export type RepoMetrics = {
  repoId: string;
  repoFullName: string;
  scanId: string | null;
  scanCompletedAt: string | null;
  adoptionScore: number;
  coverage: number;
  adoption: number;
  languages: string[];
  toolsChecked: number;
  toolsRelevant: number;
  toolsDetected: number;
  tools: ToolMetric[];
};

/**
 * Tools whose "per-contributor adoption" signal is really just
 * "this contributor committed recently." Reported for visibility,
 * excluded from adoptionScore.
 */
const COMMIT_PRESENCE_TOOLS = new Set([
  'github-actions',
  'dependabot',
  'renovate',
]);

/**
 * Language-specific tools. Relevant only when the matching language is
 * detected in the repo.
 */
const JS_TOOLS = new Set(['jest', 'eslint', 'prettier']);
const PYTHON_TOOLS = new Set(['pytest', 'black', 'ruff']);
const GO_TOOLS = new Set(['go-test', 'golangci-lint']);
const PHP_TOOLS = new Set(['phpunit']);

type DetectedLanguages = {
  js: boolean;
  python: boolean;
  go: boolean;
  php: boolean;
};

function detectLanguages(input: {
  rootFiles: string[];
  commitFilenames: string[];
  configFileKeys: string[];
}): DetectedLanguages {
  const { rootFiles, commitFilenames, configFileKeys } = input;

  const allFiles = [...rootFiles, ...commitFilenames];
  const configs = new Set(configFileKeys);

  const hasExt = (ext: string) => allFiles.some((f) => f.endsWith(ext));
  const hasConfig = (...paths: string[]) => paths.some((p) => configs.has(p));

  const js =
    hasConfig('package.json') ||
    hasExt('.js') ||
    hasExt('.jsx') ||
    hasExt('.ts') ||
    hasExt('.tsx') ||
    hasExt('.mjs') ||
    hasExt('.cjs');

  const python =
    hasConfig(
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'pytest.ini',
      'tox.ini',
    ) ||
    hasExt('.py');

  const go = hasConfig('go.mod', 'go.sum') || hasExt('.go');

  const php =
    hasConfig('composer.json', 'composer.lock', 'phpunit.xml', 'phpunit.xml.dist') ||
    hasExt('.php');

  return { js, python, go, php };
}

function isToolRelevant(toolName: string, langs: DetectedLanguages): boolean {
  if (JS_TOOLS.has(toolName)) return langs.js;
  if (PYTHON_TOOLS.has(toolName)) return langs.python;
  if (GO_TOOLS.has(toolName)) return langs.go;
  if (PHP_TOOLS.has(toolName)) return langs.php;
  // pre-commit, github-actions, dependabot, renovate — always relevant
  return true;
}

function languagesToArray(langs: DetectedLanguages): string[] {
  const out: string[] = [];
  if (langs.js) out.push('js');
  if (langs.python) out.push('python');
  if (langs.go) out.push('go');
  if (langs.php) out.push('php');
  return out;
}

export async function getRepoMetrics(repoId: string): Promise<RepoMetrics> {
  const repo = await getTrackedRepository(repoId);

  const latestScan = await pool.query<{
    id: string;
    completed_at: Date | null;
  }>(
    `SELECT id, completed_at
     FROM scans
     WHERE repo_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [repoId],
  );

  const scan = latestScan.rows[0];
  if (!scan) {
    return {
      repoId: repo.id,
      repoFullName: repo.fullName,
      scanId: null,
      scanCompletedAt: null,
      adoptionScore: 0,
      coverage: 0,
      adoption: 0,
      languages: [],
      toolsChecked: 0,
      toolsRelevant: 0,
      toolsDetected: 0,
      tools: [],
    };
  }

  const toolRows = await pool.query<{
    tool_name: string;
    category: string;
    detected: boolean;
    adoption_rate: string | number;
    evidence: Record<string, unknown> | null;
  }>(
    `SELECT tool_name, category, detected, adoption_rate, evidence
     FROM tool_usage
     WHERE scan_id = $1 AND contributor_login IS NULL
     ORDER BY tool_name`,
    [scan.id],
  );

  const contributorRows = await pool.query<{
    tool_name: string;
    adoption_rate: string | number;
  }>(
    `SELECT tool_name, adoption_rate
     FROM tool_usage
     WHERE scan_id = $1 AND contributor_login IS NOT NULL`,
    [scan.id],
  );

  const perToolStats = new Map<
    string,
    { contributorCount: number; contributorsUsing: number }
  >();
  for (const row of contributorRows.rows) {
    const entry = perToolStats.get(row.tool_name) ?? {
      contributorCount: 0,
      contributorsUsing: 0,
    };
    entry.contributorCount += 1;
    const rate = Number(row.adoption_rate);
    if (rate > 0) entry.contributorsUsing += 1;
    perToolStats.set(row.tool_name, entry);
  }

  // ─── Language detection ────────────────────────────────────────────
  // The scan context is cached in Redis with a 1h TTL. If it's still
  // around, use it — otherwise fall back to signals we can derive from
  // the tool_usage evidence (less precise but zero Redis dependency).
  const ctx = await loadCachedContext(scan.id);
  let languages: DetectedLanguages;
  if (ctx) {
    const commitFilenames = ctx.commits.flatMap((c) =>
      c.files.map((f) => f.filename),
    );
    languages = detectLanguages({
      rootFiles: ctx.rootFiles,
      commitFilenames,
      configFileKeys: Object.keys(ctx.configFiles),
    });
  } else {
    // Fallback: infer from which language-specific tools were detected.
    // Conservative — if nothing was detected we can't guess.
    const detectedToolNames = new Set(
      toolRows.rows.filter((r) => r.detected).map((r) => r.tool_name),
    );
    languages = {
      js:
        detectedToolNames.has('jest') ||
        detectedToolNames.has('eslint') ||
        detectedToolNames.has('prettier'),
      python:
        detectedToolNames.has('pytest') ||
        detectedToolNames.has('black') ||
        detectedToolNames.has('ruff'),
      go:
        detectedToolNames.has('go-test') ||
        detectedToolNames.has('golangci-lint'),
      php: detectedToolNames.has('phpunit'),
    };
  }

  const tools: ToolMetric[] = toolRows.rows.map((row) => {
    const stats = perToolStats.get(row.tool_name);
    return {
      name: row.tool_name,
      category: row.category,
      detected: row.detected,
      relevant: isToolRelevant(row.tool_name, languages),
      adoptionRate: Number(row.adoption_rate),
      contributorCount: stats?.contributorCount ?? 0,
      contributorsUsing: stats?.contributorsUsing ?? 0,
      countsTowardScore: !COMMIT_PRESENCE_TOOLS.has(row.tool_name),
      evidence: row.evidence,
    };
  });

  // ─── Score ─────────────────────────────────────────────────────────
  const relevantTools = tools.filter((t) => t.relevant);
  const detectedRelevant = relevantTools.filter((t) => t.detected);
  const scoredTools = detectedRelevant.filter((t) => t.countsTowardScore);

  const coverage =
    relevantTools.length > 0 ? detectedRelevant.length / relevantTools.length : 0;
  const adoption =
    scoredTools.length > 0
      ? scoredTools.reduce((sum, t) => sum + t.adoptionRate, 0) /
        scoredTools.length
      : 0;

  const adoptionScore = Math.round(coverage * adoption * 100) / 100;

  return {
    repoId: repo.id,
    repoFullName: repo.fullName,
    scanId: scan.id,
    scanCompletedAt: scan.completed_at?.toISOString() ?? null,
    adoptionScore,
    coverage: Math.round(coverage * 10000) / 100,
    adoption: Math.round(adoption * 100) / 100,
    languages: languagesToArray(languages),
    toolsChecked: tools.length,
    toolsRelevant: relevantTools.length,
    toolsDetected: detectedRelevant.length,
    tools,
  };
}

/**
 * Best-effort load of the Redis scan context. Returns null if it has
 * expired or was never written (e.g. backfilling old scans).
 * Kept inline so metrics.service doesn't grow a hard dependency on
 * Redis for correctness — the fallback path still works.
 */
async function loadCachedContext(
  scanId: string,
): Promise<import('../scans/scan.context.js').ScanContext | null> {
  try {
    const mod = await import('../scans/scan.context.js');
    return await mod.loadScanContext(scanId);
  } catch {
    return null;
  }
}