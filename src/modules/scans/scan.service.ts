import { pool } from '../../config/database.js';
import { scanQueue, type ScanJobData } from './scan.queue.js';
import { getTrackedRepository } from '../repositories/repository.service.js';

export type ScanRow = {
  id: string;
  repoId: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
};

function toScan(row: {
  id: string;
  repo_id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
  summary: unknown;
  created_at: Date;
}): ScanRow {
  return {
    id: row.id,
    repoId: row.repo_id,
    status: row.status as ScanRow['status'],
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    error: row.error,
    summary: (row.summary as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Creates a scans row + enqueues a BullMQ job.
 * Returns the scan row so the caller can poll /scans/:id.
 */
export async function requestScan(repoId: string, userId: string): Promise<ScanRow> {
  // Throws 404 if repo not found
  await getTrackedRepository(repoId);

  const insert = await pool.query(
    `INSERT INTO scans (repo_id, status)
     VALUES ($1, 'pending')
     RETURNING id, repo_id, status, started_at, completed_at, error,
               summary, created_at`,
    [repoId],
  );

  const scan = toScan(insert.rows[0]!);

  const jobData: ScanJobData = {
    scanId: scan.id,
    repoId,
    requestedBy: userId,
  };
  await scanQueue.add('scan', jobData, { jobId: scan.id });

  return scan;
}

export async function listScansForRepo(repoId: string): Promise<ScanRow[]> {
  const { rows } = await pool.query(
    `SELECT id, repo_id, status, started_at, completed_at, error,
            summary, created_at
     FROM scans
     WHERE repo_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [repoId],
  );
  return rows.map(toScan);
}

export async function getScan(scanId: string): Promise<ScanRow | null> {
  const { rows } = await pool.query(
    `SELECT id, repo_id, status, started_at, completed_at, error,
            summary, created_at
     FROM scans
     WHERE id = $1`,
    [scanId],
  );
  const row = rows[0];
  return row ? toScan(row) : null;
}