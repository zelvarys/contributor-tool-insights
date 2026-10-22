import type { Request, Response, NextFunction } from 'express';
import {
  listUserGitHubRepos,
  addTrackedRepository,
  listTrackedRepositories,
  getTrackedRepository,
} from './repository.service.js';
import { parseAddRepositoryBody, parseRepoIdParam } from './repository.schema.js';
import { badRequest, unauthorized } from '../../utils/errors.js';

export async function getGitHubRepos(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw unauthorized();
    const repos = await listUserGitHubRepos(req.userId);
    res.json({ repos });
  } catch (err) {
    next(err);
  }
}

export async function postRepository(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw unauthorized();

    let input;
    try {
      input = parseAddRepositoryBody(req.body);
    } catch (err) {
      throw badRequest((err as Error).message);
    }

    const repo = await addTrackedRepository(req.userId, input.githubId);
    res.status(201).json({ repository: repo });
  } catch (err) {
    next(err);
  }
}

export async function getRepositories(_req: Request, res: Response, next: NextFunction) {
  try {
    const repos = await listTrackedRepositories();
    res.json({ repositories: repos });
  } catch (err) {
    next(err);
  }
}

export async function getRepository(req: Request, res: Response, next: NextFunction) {
  try {
    let id: string;
    try {
      id = parseRepoIdParam(req.params.id);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    const repo = await getTrackedRepository(id);
    res.json({ repository: repo });
  } catch (err) {
    next(err);
  }
}