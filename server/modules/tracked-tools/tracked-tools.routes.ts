import { Router } from 'express';
import {
  getTrackedTools,
  putTrackedTools,
} from './tracked-tools.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const trackedToolsRoutes = Router();

trackedToolsRoutes.use(requireAuth);

trackedToolsRoutes.get('/repos/:id/tracked-tools', getTrackedTools);
trackedToolsRoutes.put('/repos/:id/tracked-tools', putTrackedTools);