import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Shared Redis client for app-level usage (OAuth state, caches, etc.).
 */
export const redis = new Redis(env.REDIS_URL);

redis.on('connect', () => logger.debug('Redis connecting…'));
redis.on('ready', () => logger.debug('Redis ready'));
redis.on('error', (err: Error) => logger.error('Redis error', err.message));

/**
 * Factory used by BullMQ. BullMQ requires `maxRetriesPerRequest: null`
 * and takes ownership of the connection lifecycle.
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis connection closed');
}