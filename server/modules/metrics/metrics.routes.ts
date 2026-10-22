import { Router } from 'express';
import { getMetrics } from './metrics.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const metricsRoutes = Router();

metricsRoutes.use(requireAuth);

metricsRoutes.get('/repos/:id/metrics', getMetrics);