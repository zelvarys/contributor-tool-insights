/**
 * Types shared between the server and the frontend.
 * Keep this file dependency-free — no imports from server/ or src/.
 */

export type ToolCategory =
  | 'testing'
  | 'linting'
  | 'ci_cd'
  | 'coverage'
  | 'docs'
  | 'dependencies';

export type ToolMetric = {
  name: string;
  category: ToolCategory;
  detected: boolean;
  relevant: boolean;
  tracked: boolean;
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
  toolsTracked: number;
  toolsDetected: number;
  tools: ToolMetric[];
};

export type ScanStatus = 'pending' | 'running' | 'complete' | 'failed';

export type ScanSummary = {
  id: string;
  repoId: string;
  status: ScanStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
};

export type TrackedRepository = {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  stars: number;
  forks: number;
  contributorCount: number;
  createdAt: string;
};

export type TrackedToolRow = {
  toolName: string;
  enabled: boolean;
  detected: boolean;
  relevant: boolean;
  category: string;
};

export type AuthUser = {
  id: string;
  githubId: number;
  username: string;
  email: string | null;
  avatarUrl: string | null;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};