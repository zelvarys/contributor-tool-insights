import type { Request, Response, NextFunction } from 'express';
import { getRepoMetrics } from './metrics.service.js';
import { badRequest } from '../../utils/errors.js';

function parseRepoId(param: string | undefined): string {
  if (!param) throw badRequest('Repository id is required');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)
  ) {
    throw badRequest('Invalid repository id');
  }
  return param;
}

export async function getMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    const repoId = parseRepoId(req.params.id);
    const metrics = await getRepoMetrics(repoId);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}