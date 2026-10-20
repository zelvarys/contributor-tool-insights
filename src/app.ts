import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { repositoryRoutes } from './modules/repositories/repository.routes.js';
import { scanRoutes } from './modules/scans/scan.routes.js';
import { metricsRoutes } from './modules/metrics/metrics.routes.js';
import { trackedToolsRoutes } from './modules/tracked-tools/tracked-tools.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'contributor-tool-insights',
      time: new Date().toISOString(),
    });
  });

  app.use('/auth', authRoutes);
  app.use('/repos', repositoryRoutes);
  app.use(scanRoutes);
  app.use(metricsRoutes);
  app.use(trackedToolsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}