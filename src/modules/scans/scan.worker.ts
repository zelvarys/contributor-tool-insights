import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { pool } from '../../config/database.js';
import { SCAN_QUEUE_NAME, type ScanJobData } from './scan.queue.js';
import { logger } from '../../utils/logger.js';

async function processScan(job: Job<ScanJobData>): Promise<void> {
  const { scanId, repoId } = job.data;
  logger.info(`Worker picked up scan ${scanId} for repo ${repoId}`);

  // Mark running
  await pool.query(
    `UPDATE scans
     SET status = 'running', started_at = NOW()
     WHERE id = $1`,
    [scanId],
  );

  try {
    // ── Phase 5+ will fill in the actual scanning here ──
    // For Phase 4 we just simulate work and mark complete.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const summary = {
      note: 'Phase 4 stub — no detectors run yet',
      toolsChecked: 0,
    };

    await pool.query(
      `UPDATE scans
       SET status = 'complete',
           completed_at = NOW(),
           summary = $2
       WHERE id = $1`,
      [scanId, JSON.stringify(summary)],
    );

    logger.info(`Scan ${scanId} complete`);
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
    throw err; // let BullMQ retry per attempts/backoff
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

// Allow `npm run worker` to boot just this process
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