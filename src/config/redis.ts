import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,  // important for BullMQ in later phases
  lazyConnect: false,
});

redis.on('connect', () => logger.debug('Redis connecting…'));
redis.on('ready', () => logger.debug('Redis ready'));
redis.on('error', (err) => logger.error('Redis error', err.message));

export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis connection closed');
}