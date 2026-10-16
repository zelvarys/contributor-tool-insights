import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { pingDb, closeDb } from './config/database.js';
import { closeRedis } from './config/redis.js';

const app = createApp();

async function start() {
  try {
    await pingDb();
  } catch (err) {
    logger.error('Cannot reach Postgres at boot', err);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 contributor-tool-insights listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      try {
        await closeDb();
        await closeRedis();
      } catch (err) {
        logger.error('Error during shutdown', err);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', err);
  process.exit(1);
});

start();