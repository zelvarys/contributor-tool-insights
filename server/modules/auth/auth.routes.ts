import { Router } from 'express';
import {
  redirectToGithub,
  githubCallback,
  getMe,
  logout,
} from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const authRoutes = Router();

authRoutes.get('/github', redirectToGithub);
authRoutes.get('/github/callback', githubCallback);
authRoutes.get('/me', requireAuth, getMe);
authRoutes.post('/logout', logout);