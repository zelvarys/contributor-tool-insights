import { Router } from 'express';
import { postScan, getScans, getScanById } from './scan.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';

export const scanRoutes = Router();

scanRoutes.use(requireAuth);

const scanLimiter = rateLimit({
  name: 'scan',
  windowSeconds: 60,
  max: 10,
});

scanRoutes.post('/repos/:id/scan', scanLimiter, postScan);
scanRoutes.get('/repos/:id/scans', getScans);
scanRoutes.get('/scans/:scanId', getScanById);