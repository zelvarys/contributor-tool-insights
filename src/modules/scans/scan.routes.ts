import { Router } from 'express';
import { postScan, getScans, getScanById } from './scan.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const scanRoutes = Router();

scanRoutes.use(requireAuth);

scanRoutes.post('/repos/:id/scan', postScan);
scanRoutes.get('/repos/:id/scans', getScans);
scanRoutes.get('/scans/:scanId', getScanById);