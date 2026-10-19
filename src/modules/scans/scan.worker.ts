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

const MAX_COMMIT_DETAIL_LOOKUPS = 30;
const MAX_CONTRIBUTORS_PAGES = 2;
const MAX_COMMITS_PAGES = 3;

/**
 * Config files we try to read at the repo root. Missing ones are skipped.
 * Extend as detectors demand. Sorted roughly by cost (small files first).
 */
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

  'go.mod',
  'go.sum',

  'Gemfile',
  '.rubocop.yml',

  'composer.json',
  'phpunit.xml',
  'phpunit.xml.dist',

  'mkdocs.yml',
  'docusaurus.config.js',
  'docusaurus.config.ts',
];

/**
 * Config files that live in a subdirectory. `listContents` on the root
 * gives us directory listing; this fetches a fixed name inside a dir.
 */
const CONFIG_SUBDIR_CANDIDATES = [
  { path: '.github/dependabot.yml' },
  { path: '.github/renovate.json' },
  { path: 'renovate.json' },
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
  // ─── 1. Contributors ────────────────────────────────────────────────
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

  // ─── 2. Recent commits ──────────────────────────────────────────────
  const commitsRaw = await fetchRecentCommits(
    token,
    owner,
    name,
    defaultBranch,
    MAX_COMMITS_PAGES,
  );

  // ─── 3. Commit details (capped) ─────────────────────────────────────
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
      // Large commit diffs sometimes 403/422 — skip files for this commit.
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

  // ─── 4. Root listing ────────────────────────────────────────────────
  const root = await listContents(token, owner, name, '', defaultBranch);
  const rootFiles = root
    .filter((e) => e.type === 'file')
    .map((e) => e.name);

  // ─── 5. Config files ────────────────────────────────────────────────
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

  // ─── 6. GitHub Actions workflows ────────────────────────────────────
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
    // ─── Repo metadata ────────────────────────────────────────────────
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

    // ─── User token ───────────────────────────────────────────────────
    const token = await getAccessTokenForUser(requestedBy);
    if (!token) {
      throw new Error(`No GitHub token available for user ${requestedBy}`);
    }

    // ─── Build context ────────────────────────────────────────────────
    const ctx = await buildScanContext(
      token,
      scanId,
      repoId,
      repo.owner,
      repo.name,
      repo.default_branch,
    );

    await saveScanContext(ctx);

    // ─── Stub summary (Phase 6 will replace this) ─────────────────────
    const summary = {
      note: 'Phase 5 context cached — detectors not run yet',
      commitsFetched: ctx.commits.length,
      contributorsFetched: ctx.contributors.length,
      configFilesFound: Object.keys(ctx.configFiles),
      workflowFilesFound: ctx.workflowFiles,
    };

    await pool.query(
      `UPDATE scans
       SET status = 'complete',
           completed_at = NOW(),
           summary = $2
       WHERE id = $1`,
      [scanId, JSON.stringify(summary)],
    );

    logger.info(
      `Scan ${scanId} complete — ${ctx.commits.length} commits, ` +
        `${ctx.contributors.length} contributors, ` +
        `${Object.keys(ctx.configFiles).length} config files`,
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