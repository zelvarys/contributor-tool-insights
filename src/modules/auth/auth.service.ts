import { pool } from '../../config/database.js';
import { encryptToken, decryptToken } from '../../utils/crypto.js';
import { signJwt, parseExpiresIn } from '../../utils/jwt.js';
import { env } from '../../config/env.js';
import { getAuthenticatedUser, getPrimaryEmail } from '../../integrations/github/github.client.js';
import { logger } from '../../utils/logger.js';

export type AuthUser = {
  id: string;
  githubId: number;
  username: string;
  email: string | null;
  avatarUrl: string | null;
};

export async function handleGithubCallback(accessToken: string): Promise<string> {
  const ghUser = await getAuthenticatedUser(accessToken);
  const email = ghUser.email ?? (await getPrimaryEmail(accessToken));
  const encrypted = encryptToken(accessToken);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (github_id, username, email, avatar_url, access_token)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (github_id) DO UPDATE
       SET username     = EXCLUDED.username,
           email        = EXCLUDED.email,
           avatar_url   = EXCLUDED.avatar_url,
           access_token = EXCLUDED.access_token,
           updated_at   = NOW()
     RETURNING id`,
    [ghUser.id, ghUser.login, email, ghUser.avatar_url, encrypted],
  );

  const userId = rows[0]!.id;
  logger.info(`User ${ghUser.login} (${userId}) authenticated`);

  const expiresInSeconds = parseExpiresIn(env.JWT_EXPIRES_IN);
  return signJwt(userId, expiresInSeconds);
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { rows } = await pool.query<{
    id: string;
    github_id: string;
    username: string;
    email: string | null;
    avatar_url: string | null;
  }>(
    `SELECT id, github_id, username, email, avatar_url
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    githubId: Number(row.github_id),
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_url,
  };
}

export async function getAccessTokenForUser(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ access_token: string }>(
    'SELECT access_token FROM users WHERE id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return decryptToken(row.access_token);
}