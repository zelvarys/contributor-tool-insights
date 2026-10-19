import { redis } from '../../config/redis.js';

export type CommitFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
};

export type CommitInfo = {
  sha: string;
  authorLogin: string | null;
  message: string;
  date: string;
  files: CommitFile[];
};

export type ContributorInfo = {
  login: string;
  contributions: number;
};

export type RepoRootListing = {
  path: string;
  files: string[];
};

export type ScanContext = {
  scanId: string;
  repoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  fetchedAt: string;

  commits: CommitInfo[];
  contributors: ContributorInfo[];
  rootFiles: string[];

  /**
   * Selected config files, keyed by path, with their text contents.
   * Populated only for files that exist and are text-readable.
   * e.g. { "package.json": "...", ".eslintrc.json": "..." }
   */
  configFiles: Record<string, string>;

  /**
   * Whether the repo has a .github/workflows/ directory and what files
   * live inside it (relative paths).
   */
  workflowFiles: string[];
};

const TTL_SECONDS = 3600;

export function contextKey(scanId: string): string {
  return `scan:context:${scanId}`;
}

export async function saveScanContext(ctx: ScanContext): Promise<void> {
  await redis.set(contextKey(ctx.scanId), JSON.stringify(ctx), 'EX', TTL_SECONDS);
}

export async function loadScanContext(scanId: string): Promise<ScanContext | null> {
  const raw = await redis.get(contextKey(scanId));
  if (!raw) return null;
  return JSON.parse(raw) as ScanContext;
}

export async function deleteScanContext(scanId: string): Promise<void> {
  await redis.del(contextKey(scanId));
}