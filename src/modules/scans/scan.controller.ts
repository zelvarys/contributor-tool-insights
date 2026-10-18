import type { Request, Response, NextFunction } from 'express';
import { requestScan, listScansForRepo, getScan } from './scan.service.js';
import { badRequest, notFound, unauthorized } from '../../utils/errors.js';

function requireUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export async function postScan(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const repoId = req.params.id;
    if (!repoId) throw badRequest('Repository id is required');

    const scan = await requestScan(repoId, userId);
    res.status(202).json({ scan });
  } catch (err) {
    next(err);
  }
}

export async function getScans(req: Request, res: Response, next: NextFunction) {
  try {
    const repoId = req.params.id;
    if (!repoId) throw badRequest('Repository id is required');
    const scans = await listScansForRepo(repoId);
    res.json({ scans });
  } catch (err) {
    next(err);
  }
}

export async function getScanById(req: Request, res: Response, next: NextFunction) {
  try {
    const scanId = req.params.scanId;
    if (!scanId) throw badRequest('Scan id is required');
    const scan = await getScan(scanId);
    if (!scan) throw notFound('Scan not found');
    res.json({ scan });
  } catch (err) {
    next(err);
  }
}