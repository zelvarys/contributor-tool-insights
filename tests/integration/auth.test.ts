import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb } from '../../src/config/database.js';
import { closeRedis } from '../../src/config/redis.js';
import { truncateAll, insertUser } from '../helpers/db.js';
import { signJwt, parseExpiresIn } from '../../src/utils/jwt.js';
import { env } from '../../src/config/env.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await truncateAll();
  await closeDb();
  await closeRedis();
});

describe('auth', () => {
  it('GET /health returns ok without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /auth/me returns 401 without token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /auth/me returns user with valid token', async () => {
    const userId = await insertUser({ githubId: 1, username: 'alice' });
    const token = signJwt(userId, parseExpiresIn(env.JWT_EXPIRES_IN));

    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.username).toBe('alice');
  });

  it('POST /auth/logout clears the cookie', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', 'token=abc');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(String(setCookie)).toMatch(/token=;/);
  });

  it('rejects an expired token', async () => {
    const userId = await insertUser({ githubId: 2, username: 'bob' });
    const token = signJwt(userId, -1);
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `token=${token}`);
    expect(res.status).toBe(401);
  });
});