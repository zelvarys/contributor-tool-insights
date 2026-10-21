import { pool } from '../../config/database.js';
import { scanQueue, type ScanJobData } from './scan.queue.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import { AppError } from '../../utils/errors.js';
import { cacheGet, cacheSet, cacheKeys } from '../../utils/cache.js';

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

const FRESH_SCAN_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Returns the cached scan if it's still fresh, else null.
 * "Fresh" means: completed less than 1 hour ago.
 */
async function getCachedScanResult(
  repoId: string,
): Promise<{ scan: ScanRow; cached: true } | null> {
  const cached = await cacheGet<{ scan: ScanRow; writtenAt: number }>(
    cacheKeys.scanResult(repoId),
  );
  if (!cached) return null;
  return { scan: cached.scan, cached: true };
}

export async function requestScan(
  repoId: string,
  userId: string,
): Promise<{ scan: ScanRow; cached: boolean }> {
  await getTrackedRepository(repoId); // 404 if missing

  // Cache short-circuit: return the last completed scan if fresh.
  const cached = await getCachedScanResult(repoId);
  if (cached) {
    return { scan: cached.scan, cached: true };
  }

  // Prevent double-queueing by taking a short lock.
  // If a scan is already pending/running for this repo within the last
  // 5 minutes, return that one instead of queueing another.
  const existing = await pool.query(
    `SELECT id, repo_id, status, started_at, completed_at, error,
            summary, created_at
     FROM scans
     WHERE repo_id = $1 AND status IN ('pending','running')
     ORDER BY created_at DESC
     LIMIT 1`,
    [repoId],
  );
  if (existing.rows[0]) {
    return { scan: toScan(existing.rows[0]), cached: true };
  }

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

  return { scan, cached: false };
}

/**
 * Called by the worker when a scan completes successfully.
 * Writes the scan result to the cache with a 1h TTL.
 */
export async function cacheCompletedScan(scan: ScanRow): Promise<void> {
  await cacheSet(
    cacheKeys.scanResult(scan.repoId),
    { scan, writtenAt: Date.now() },
    FRESH_SCAN_TTL_SECONDS,
  );
}

/**
 * Called by the worker when a scan fails — clear any stale cache so
 * the next request re-queues instead of returning bad data.
 */
export async function invalidateScanCache(repoId: string): Promise<void> {
  await import('../../utils/cache.js').then((m) =>
    m.cacheDel(cacheKeys.scanResult(repoId)),
  );
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