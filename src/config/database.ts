import { Pool } from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error', err);
});

export async function pingDb(): Promise<void> {
  const { rows } = await pool.query<{ now: Date }>('SELECT NOW() as now');
  logger.debug(`Postgres connected at ${rows[0]?.now.toISOString()}`);
}

export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info('Postgres pool closed');
}