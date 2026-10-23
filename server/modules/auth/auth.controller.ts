import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { buildAuthorizeUrl, exchangeCodeForToken } from '../../integrations/github/github.oauth.js';
import { handleGithubCallback, getUserById } from './auth.service.js';
import { badRequest, unauthorized } from '../../utils/errors.js';
import { parseExpiresIn } from '../../utils/jwt.js';

const STATE_TTL_SECONDS = 600;
const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_PATH = '/auth/github';

function setStateCookie(res: Response, state: string): void {
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS * 1000,
    path: STATE_COOKIE_PATH,
  });
}

function clearStateCookie(res: Response): void {
  res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    timingSafeEqual(aBuffer, aBuffer);
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

export async function redirectToGithub(_req: Request, res: Response, next: NextFunction) {
  try {
    const state = randomBytes(24).toString('hex');
    await redis.set(`oauth:state:${state}`, '1', 'EX', STATE_TTL_SECONDS);
    setStateCookie(res, state);
    res.redirect(buildAuthorizeUrl(state));
  } catch (err) {
    next(err);
  }
}

export async function githubCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const cookieState = req.cookies?.[STATE_COOKIE];

    clearStateCookie(res);

    if (!code || !state) throw badRequest('Missing code or state');

    if (typeof cookieState !== 'string' || !safeEqual(cookieState, state)) {
      throw badRequest('Invalid OAuth state (cookie mismatch)');
    }

    const stateKey = `oauth:state:${state}`;
    const exists = await redis.get(stateKey);
    if (!exists) throw badRequest('Invalid or expired OAuth state');
    await redis.del(stateKey);

    const { access_token } = await exchangeCodeForToken(code);
    const jwt = await handleGithubCallback(access_token);

    const maxAgeMs = parseExpiresIn(env.JWT_EXPIRES_IN) * 1000;
    res.cookie('token', jwt, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });

    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw unauthorized();
    const user = await getUserById(req.userId);
    if (!user) throw unauthorized('User no longer exists');
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
}
