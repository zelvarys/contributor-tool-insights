import { Queue } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';

export const SCAN_QUEUE_NAME = 'repo-scans';

export type ScanJobData = {
  scanId: string;
  repoId: string;
  requestedBy: string;
};

export const scanQueue = new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});