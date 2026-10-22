import type { Request, Response, NextFunction } from 'express';
import {
  listTrackedTools,
  replaceTrackedTools,
} from './tracked-tools.service.js';
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

function parseUpdateBody(body: unknown): { tools: Array<{ name: string; enabled: boolean }> } {
  if (typeof body !== 'object' || body === null) {
    throw badRequest('Request body must be an object');
  }
  const tools = (body as Record<string, unknown>).tools;
  if (!Array.isArray(tools)) {
    throw badRequest('Body must include `tools` array');
  }
  return {
    tools: tools.map((t, i) => {
      if (typeof t !== 'object' || t === null) {
        throw badRequest(`tools[${i}] must be an object`);
      }
      const obj = t as Record<string, unknown>;
      if (typeof obj.name !== 'string') {
        throw badRequest(`tools[${i}].name must be a string`);
      }
      if (typeof obj.enabled !== 'boolean') {
        throw badRequest(`tools[${i}].enabled must be a boolean`);
      }
      return { name: obj.name, enabled: obj.enabled };
    }),
  };
}

export async function getTrackedTools(req: Request, res: Response, next: NextFunction) {
  try {
    const repoId = parseRepoId(req.params.id);
    const tools = await listTrackedTools(repoId);
    res.json({ repoId, tools });
  } catch (err) {
    next(err);
  }
}

export async function putTrackedTools(req: Request, res: Response, next: NextFunction) {
  try {
    const repoId = parseRepoId(req.params.id);
    const input = parseUpdateBody(req.body);
    const tools = await replaceTrackedTools(repoId, input);
    res.json({ repoId, tools });
  } catch (err) {
    next(err);
  }
}