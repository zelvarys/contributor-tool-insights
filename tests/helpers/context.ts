import type { ScanContext, CommitInfo } from '../../src/modules/scans/scan.context.js';

export type ContextOptions = {
  scanId?: string;
  repoId?: string;
  owner?: string;
  name?: string;
  defaultBranch?: string;
  rootFiles?: string[];
  configFiles?: Record<string, string>;
  workflowFiles?: string[];
  commits?: CommitInfo[];
  contributors?: Array<{ login: string; contributions: number }>;
};

export function buildScanContext(opts: ContextOptions = {}): ScanContext {
  return {
    scanId: opts.scanId ?? 'scan-1',
    repoId: opts.repoId ?? 'repo-1',
    owner: opts.owner ?? 'test',
    name: opts.name ?? 'test-repo',
    defaultBranch: opts.defaultBranch ?? 'main',
    fetchedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    commits: opts.commits ?? [],
    contributors: opts.contributors ?? [],
    rootFiles: opts.rootFiles ?? [],
    configFiles: opts.configFiles ?? {},
    workflowFiles: opts.workflowFiles ?? [],
  };
}

export function buildCommit(opts: {
  sha?: string;
  authorLogin?: string | null;
  filenames?: string[];
  message?: string;
}): CommitInfo {
  return {
    sha: opts.sha ?? 'abc123',
    authorLogin: opts.authorLogin ?? null,
    message: opts.message ?? 'chore: test',
    date: new Date('2026-01-01T00:00:00Z').toISOString(),
    files: (opts.filenames ?? []).map((f) => ({
      filename: f,
      status: 'modified',
      additions: 1,
      deletions: 0,
    })),
  };
}