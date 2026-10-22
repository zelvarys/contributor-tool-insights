import { pool } from '../../config/database.js';
import { scanQueue, type ScanJobData } from './scan.queue.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import { cacheGet, cacheSet, cacheDel, cacheKeys } from '../../utils/cache.js';
import type { ScanSummary, ScanStatus } from '../../../shared/types/api.js';

function toScan(row: {
  id: string;
  repo_id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
  summary: unknown;
  created_at: Date;
}): ScanSummary {
  return {
    id: row.id,
    repoId: row.repo_id,
    status: row.status as ScanStatus,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    error: row.error,
    summary: (row.summary as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

const FRESH_SCAN_TTL_SECONDS = 60 * 60;

export async function requestScan(
  repoId: string,
  userId: string,
): Promise<{ scan: ScanSummary; cached: boolean }> {
  await getTrackedRepository(repoId);

  const cached = await cacheGet<{ scan: ScanSummary; writtenAt: number }>(
    cacheKeys.scanResult(repoId),
  );
  if (cached) {
    return { scan: cached.scan, cached: true };
  }

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

export async function cacheCompletedScan(scan: ScanSummary): Promise<void> {
  await cacheSet(
    cacheKeys.scanResult(scan.repoId),
    { scan, writtenAt: Date.now() },
    FRESH_SCAN_TTL_SECONDS,
  );
}

export async function invalidateScanCache(repoId: string): Promise<void> {
  await cacheDel(cacheKeys.scanResult(repoId));
}

export async function listScansForRepo(repoId: string): Promise<ScanSummary[]> {
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

export async function getScan(scanId: string): Promise<ScanSummary | null> {
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