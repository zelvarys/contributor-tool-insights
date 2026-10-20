import { pool } from '../../config/database.js';
import { getTrackedRepository } from '../repositories/repository.service.js';

export type ToolMetric = {
  name: string;
  category: string;
  detected: boolean;
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
  toolsChecked: number;
  toolsDetected: number;
  tools: ToolMetric[];
};

/**
 * Tools whose "per-contributor adoption" signal is really just
 * "this contributor committed recently." These are reported for
 * visibility but excluded from the adoptionScore.
 */
const COMMIT_PRESENCE_TOOLS = new Set([
  'github-actions',
  'dependabot',
  'renovate',
]);

export async function getRepoMetrics(repoId: string): Promise<RepoMetrics> {
  const repo = await getTrackedRepository(repoId);

  // Latest scan for this repo
  const latestScan = await pool.query<{
    id: string;
    completed_at: Date | null;
    summary: Record<string, unknown> | null;
  }>(
    `SELECT id, completed_at, summary
     FROM scans
     WHERE repo_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [repoId],
  );

  const scan = latestScan.rows[0];
  if (!scan) {
    // Repo exists but has no completed scan yet — return an empty
    // but well-shaped response so the UI can show "run a scan".
    return {
      repoId: repo.id,
      repoFullName: repo.fullName,
      scanId: null,
      scanCompletedAt: null,
      adoptionScore: 0,
      coverage: 0,
      adoption: 0,
      toolsChecked: 0,
      toolsDetected: 0,
      tools: [],
    };
  }

  // Repo-level tool rows for this scan
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

  // Per-contributor rows for this scan
  const contributorRows = await pool.query<{
    tool_name: string;
    adoption_rate: string | number;
  }>(
    `SELECT tool_name, adoption_rate
     FROM tool_usage
     WHERE scan_id = $1 AND contributor_login IS NOT NULL`,
    [scan.id],
  );

  // Aggregate per-contributor adoption into per-tool counts
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

  const tools: ToolMetric[] = toolRows.rows.map((row) => {
    const stats = perToolStats.get(row.tool_name);
    return {
      name: row.tool_name,
      category: row.category,
      detected: row.detected,
      adoptionRate: Number(row.adoption_rate),
      contributorCount: stats?.contributorCount ?? 0,
      contributorsUsing: stats?.contributorsUsing ?? 0,
      countsTowardScore: !COMMIT_PRESENCE_TOOLS.has(row.tool_name),
      evidence: row.evidence,
    };
  });

  // Compute coverage + adoption on the score-counting, detected subset
  const totalTools = tools.length;
  const detectedTools = tools.filter((t) => t.detected);
  const scoredTools = detectedTools.filter((t) => t.countsTowardScore);

  const coverage = totalTools > 0 ? detectedTools.length / totalTools : 0;
  const adoption =
    scoredTools.length > 0
      ? scoredTools.reduce((sum, t) => sum + t.adoptionRate, 0) /
        scoredTools.length
      : 0;

  const adoptionScore =
    Math.round(coverage * adoption * 100) / 100;

  return {
    repoId: repo.id,
    repoFullName: repo.fullName,
    scanId: scan.id,
    scanCompletedAt: scan.completed_at?.toISOString() ?? null,
    adoptionScore,
    coverage: Math.round(coverage * 10000) / 100,     // 0..1 → 0..100
    adoption: Math.round(adoption * 100) / 100,      // 0..100 with 2dp
    toolsChecked: totalTools,
    toolsDetected: detectedTools.length,
    tools,
  };
}