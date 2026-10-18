import { Router } from 'express';
import {
  getGitHubRepos,
  postRepository,
  getRepositories,
  getRepository,
} from './repository.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const repositoryRoutes = Router();

// All repo routes require authentication
repositoryRoutes.use(requireAuth);

// List the user's GitHub repos (not yet tracked) for selection
repositoryRoutes.get('/github', getGitHubRepos);

// Add a repo to tracking
repositoryRoutes.post('/', postRepository);

// List tracked repos
repositoryRoutes.get('/', getRepositories);

// Get one tracked repo
repositoryRoutes.get('/:id', getRepository);