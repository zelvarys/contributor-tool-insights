import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { pool } from '../../config/database.js';
import { SCAN_QUEUE_NAME, type ScanJobData } from './scan.queue.js';
import { logger } from '../../utils/logger.js';
import { getAccessTokenForUser } from '../auth/auth.service.js';
import {
  fetchRecentCommits,
  fetchCommitDetail,
  fetchContributors,
  listContents,
  readFileText,
} from '../../integrations/github/github.client.js';
import {
  saveScanContext,
  type ScanContext,
  type CommitInfo,
  type CommitFile,
} from './scan.context.js';
import { detectors } from '../tools/detector.registry.js';
import type { DetectionResult } from '../tools/detector.interface.js';
import { backfillTrackedToolsFromScan } from '../tracked-tools/tracked-tools.service.js';

const MAX_COMMIT_DETAIL_LOOKUPS = 30;
const MAX_CONTRIBUTORS_PAGES = 2;
const MAX_COMMITS_PAGES = 3;

const CONFIG_FILE_CANDIDATES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',

  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',

  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',

  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'jest.config.cjs',
  'jest.config.json',

  'pyproject.toml',
  'setup.cfg',
  'setup.py',
  'requirements.txt',
  'pytest.ini',
  'tox.ini',
  'ruff.toml',
  '.ruff.toml',

  'go.mod',
  'go.sum',
  '.golangci.yml',
  '.golangci.yaml',
  '.golangci.toml',
  '.golangci.json',

  'composer.json',
  'composer.lock',
  'phpunit.xml',
  'phpunit.xml.dist',

  'Gemfile',
  '.rubocop.yml',

  'mkdocs.yml',
  'docusaurus.config.js',
  'docusaurus.config.ts',
];

const CONFIG_SUBDIR_CANDIDATES = [
  { path: '.github/dependabot.yml' },
  { path: '.github/dependabot.yaml' },
  { path: '.github/renovate.json' },
  { path: '.github/renovate.json5' },
  { path: 'renovate.json' },
  { path: 'renovate.json5' },
  { path: '.renovaterc' },
  { path: '.renovaterc.json' },
  { path: '.pre-commit-config.yaml' },
  { path: '.coveralls.yml' },
  { path: 'codecov.yml' },
  { path: '.codecov.yml' },
];

async function buildScanContext(
  token: string,
  scanId: string,
  repoId: string,
  owner: string,
  name: string,
  defaultBranch: string,
): Promise<ScanContext> {
  const contributorsRaw = await fetchContributors(
    token,
    owner,
    name,
    MAX_CONTRIBUTORS_PAGES,
  );
  const contributors = contributorsRaw.map((c) => ({
    login: c.login,
    contributions: c.contributions,
  }));

  const commitsRaw = await fetchRecentCommits(
    token,
    owner,
    name,
    defaultBranch,
    MAX_COMMITS_PAGES,
  );

  const commits: CommitInfo[] = [];
  const detailTargets = commitsRaw.slice(0, MAX_COMMIT_DETAIL_LOOKUPS);

  for (const commit of detailTargets) {
    let files: CommitFile[] = [];
    try {
      const detail = await fetchCommitDetail(token, owner, name, commit.sha);
      files = (detail.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }));
    } catch (err) {
      logger.debug(
        `Skipping files for commit ${commit.sha.slice(0, 7)}: ${(err as Error).message}`,
      );
    }

    commits.push({
      sha: commit.sha,
      authorLogin: commit.author?.login ?? null,
      message: commit.commit.message,
      date: commit.commit.author?.date ?? new Date().toISOString(),
      files,
    });
  }

  const root = await listContents(token, owner, name, '', defaultBranch);
  const rootFiles = root.filter((e) => e.type === 'file').map((e) => e.name);

  const configFiles: Record<string, string> = {};

  for (const path of CONFIG_FILE_CANDIDATES) {
    if (!rootFiles.includes(path)) continue;
    const content = await readFileText(token, owner, name, path, defaultBranch);
    if (content !== null) configFiles[path] = content;
  }

  for (const { path } of CONFIG_SUBDIR_CANDIDATES) {
    const content = await readFileText(token, owner, name, path, defaultBranch);
    if (content !== null) configFiles[path] = content;
  }

  const workflowEntries = await listContents(
    token,
    owner,
    name,
    '.github/workflows',
    defaultBranch,
  );
  const workflowFiles = workflowEntries
    .filter((e) => e.type === 'file')
    .map((e) => `.github/workflows/${e.name}`);

  for (const wf of workflowFiles) {
    if (wf in configFiles) continue;
    const content = await readFileText(token, owner, name, wf, defaultBranch);
    if (content !== null) configFiles[wf] = content;
  }

  return {
    scanId,
    repoId,
    owner,
    name,
    defaultBranch,
    fetchedAt: new Date().toISOString(),
    commits,
    contributors,
    rootFiles,
    configFiles,
    workflowFiles,
  };
}

async function runDetectors(ctx: ScanContext): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  for (const detector of detectors) {
    try {
      const result = await detector.detect(ctx);
      results.push(result);
    } catch (err) {
      logger.warn(
        `Detector ${detector.name} failed: ${(err as Error).message}`,
      );
    }
  }
  return results;
}

async function persistToolUsage(
  scanId: string,
  repoId: string,
  results: DetectionResult[],
): Promise<void> {
  if (results.length === 0) return;

  await pool.query('DELETE FROM tool_usage WHERE scan_id = $1', [scanId]);

  for (const r of results) {
    await pool.query(
      `INSERT INTO tool_usage
         (scan_id, repo_id, tool_name, category, detected, adoption_rate,
          contributor_id, contributor_login, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7)`,
      [
        scanId,
        repoId,
        r.tool,
        r.category,
        r.detected,
        r.adoptionRate,
        JSON.stringify(r.evidence),
      ],
    );

    if (r.perContributor) {
      for (const [login, used] of Object.entries(r.perContributor)) {
        await pool.query(
          `INSERT INTO tool_usage
             (scan_id, repo_id, tool_name, category, detected, adoption_rate,
              contributor_id, contributor_login, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)`,
          [
            scanId,
            repoId,
            r.tool,
            r.category,
            r.detected,
            used ? 100 : 0,
            login,
            JSON.stringify({ contributorEvidence: used }),
          ],
        );
      }
    }
  }
}

function detectLanguagesFromContext(ctx: ScanContext): {
  js: boolean;
  python: boolean;
  go: boolean;
  php: boolean;
} {
  const commitFilenames = ctx.commits.flatMap((c) =>
    c.files.map((f) => f.filename),
  );
  const allFiles = [...ctx.rootFiles, ...commitFilenames];
  const configs = new Set(Object.keys(ctx.configFiles));
  const hasExt = (ext: string) => allFiles.some((f) => f.endsWith(ext));
  const hasConfig = (...paths: string[]) => paths.some((p) => configs.has(p));

  return {
    js:
      hasConfig('package.json') ||
      hasExt('.js') ||
      hasExt('.jsx') ||
      hasExt('.ts') ||
      hasExt('.tsx') ||
      hasExt('.mjs') ||
      hasExt('.cjs'),
    python:
      hasConfig(
        'pyproject.toml',
        'setup.py',
        'setup.cfg',
        'requirements.txt',
        'pytest.ini',
        'tox.ini',
      ) ||
      hasExt('.py'),
    go: hasConfig('go.mod', 'go.sum') || hasExt('.go'),
    php:
      hasConfig(
        'composer.json',
        'composer.lock',
        'phpunit.xml',
        'phpunit.xml.dist',
      ) ||
      hasExt('.php'),
  };
}

function buildSummary(results: DetectionResult[]): Record<string, unknown> {
  const tools = results.map((r) => ({
    name: r.tool,
    category: r.category,
    detected: r.detected,
    adoptionRate: r.adoptionRate,
  }));

  const detected = results.filter((r) => r.detected);
  const adoptionScore =
    detected.length > 0
      ? Math.round(
          (detected.reduce((sum, r) => sum + r.adoptionRate, 0) /
            detected.length) *
            100,
        ) / 100
      : 0;

  return {
    adoptionScore,
    toolsChecked: results.length,
    toolsDetected: detected.length,
    tools,
  };
}

async function processScan(job: Job<ScanJobData>): Promise<void> {
  const { scanId, repoId, requestedBy } = job.data;
  logger.info(`Worker picked up scan ${scanId} for repo ${repoId}`);

  await pool.query(
    `UPDATE scans
     SET status = 'running', started_at = NOW()
     WHERE id = $1`,
    [scanId],
  );

  try {
    const repoRow = await pool.query<{
      owner: string;
      name: string;
      default_branch: string;
    }>(
      `SELECT owner, name, default_branch
       FROM repositories
       WHERE id = $1`,
      [repoId],
    );
    const repo = repoRow.rows[0];
    if (!repo) throw new Error(`Repository ${repoId} not found`);

    const token = await getAccessTokenForUser(requestedBy);
    if (!token) {
      throw new Error(`No GitHub token available for user ${requestedBy}`);
    }

    const ctx = await buildScanContext(
      token,
      scanId,
      repoId,
      repo.owner,
      repo.name,
      repo.default_branch,
    );

    await saveScanContext(ctx);

    const results = await runDetectors(ctx);
    await persistToolUsage(scanId, repoId, results);

    // Backfill tracked_tools from detected + relevant tools.
    // Existing rows are preserved — user choices win.
    const languages = detectLanguagesFromContext(ctx);
    try {
      await backfillTrackedToolsFromScan(
        repoId,
        results.map((r) => ({
          toolName: r.tool,
          detected: r.detected,
          category: r.category,
        })),
        languages,
      );
    } catch (err) {
      // Non-fatal — the scan itself succeeded, backfill is best-effort
      logger.warn(
        `tracked_tools backfill failed for repo ${repoId}: ${(err as Error).message}`,
      );
    }

    const summary = buildSummary(results);

    await pool.query(
      `UPDATE scans
       SET status = 'complete',
           completed_at = NOW(),
           summary = $2
       WHERE id = $1`,
      [scanId, JSON.stringify(summary)],
    );

    logger.info(
      `Scan ${scanId} complete — ${results.length} tools checked, ` +
        `${results.filter((r) => r.detected).length} detected`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE scans
       SET status = 'failed',
         completed_at = NOW(),
         error = $2
       WHERE id = $1`,
      [scanId, message],
    );
    logger.error(`Scan ${scanId} failed: ${message}`);
    throw err;
  }
}

export function startWorker(): Worker<ScanJobData> {
  const worker = new Worker<ScanJobData>(SCAN_QUEUE_NAME, processScan, {
    connection: createRedisConnection(),
    concurrency: 2,
  });

  worker.on('ready', () => logger.info(`Scan worker ready (queue: ${SCAN_QUEUE_NAME})`));
  worker.on('failed', (job, err) =>
    logger.error(`Job ${job?.id} failed: ${err.message}`),
  );

  return worker;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = startWorker();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — closing scan worker`);
    await worker.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}