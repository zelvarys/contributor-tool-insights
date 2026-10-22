import { pool } from '../../config/database.js';
import { getAccessTokenForUser } from '../auth/auth.service.js';
import {
  listAuthenticatedUserRepos,
  getRepo,
  getContributorCount,
  type GitHubRepo,
} from '../../integrations/github/github.client.js';
import { AppError, badRequest, notFound } from '../../utils/errors.js';
import type { TrackedRepository } from '../../../shared/types/api.js';

function toTracked(row: {
  id: string;
  github_id: string;
  owner: string;
  name: string;
  full_name: string;
  is_private: boolean;
  default_branch: string;
  stars: number;
  forks: number;
  contributor_count: number;
  created_at: Date;
}): TrackedRepository {
  return {
    id: row.id,
    githubId: Number(row.github_id),
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    isPrivate: row.is_private,
    defaultBranch: row.default_branch,
    stars: row.stars,
    forks: row.forks,
    contributorCount: row.contributor_count,
    createdAt: row.created_at.toISOString(),
  };
}

async function getUsernameForUser(userId: string): Promise<string> {
  const { rows } = await pool.query<{ username: string }>(
    'SELECT username FROM users WHERE id = $1',
    [userId],
  );
  const username = rows[0]?.username;
  if (!username) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return username;
}

export async function listUserGitHubRepos(userId: string): Promise<GitHubRepo[]> {
  const token = await getAccessTokenForUser(userId);
  if (!token) {
    throw new AppError(
      'GitHub token unavailable — please re-authenticate',
      401,
      'UNAUTHORIZED',
    );
  }
  const userLogin = await getUsernameForUser(userId);
  return listAuthenticatedUserRepos(token, userLogin);
}

export async function addTrackedRepository(
  userId: string,
  githubId: number,
): Promise<TrackedRepository> {
  const token = await getAccessTokenForUser(userId);
  if (!token) {
    throw new AppError(
      'GitHub token unavailable — please re-authenticate',
      401,
      'UNAUTHORIZED',
    );
  }
  const userLogin = await getUsernameForUser(userId);

  let target: GitHubRepo | null = null;
  for (let page = 1; page <= 3; page += 1) {
    const repos = await listAuthenticatedUserRepos(token, userLogin, page);
    target = repos.find((r) => r.id === githubId) ?? null;
    if (target) break;
    if (repos.length < 100) break;
  }

  if (!target) {
    throw badRequest('Repository not found in your GitHub account');
  }

  await getRepo(token, target.owner.login, target.name);

  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM repositories WHERE github_id = $1',
    [githubId],
  );
  if (existing.rows.length > 0) {
    throw new AppError('Repository is already tracked', 409, 'CONFLICT');
  }

  const contributorCount = await getContributorCount(
    token,
    target.owner.login,
    target.name,
  );

  const { rows } = await pool.query(
    `INSERT INTO repositories
       (github_id, owner, name, full_name, is_private, default_branch,
        stars, forks, contributor_count, added_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, github_id, owner, name, full_name, is_private,
               default_branch, stars, forks, contributor_count, created_at`,
    [
      target.id,
      target.owner.login,
      target.name,
      target.full_name,
      target.private,
      target.default_branch,
      target.stargazers_count,
      target.forks_count,
      contributorCount,
      userId,
    ],
  );

  return toTracked(rows[0]!);
}

export async function listTrackedRepositories(): Promise<TrackedRepository[]> {
  const { rows } = await pool.query(
    `SELECT id, github_id, owner, name, full_name, is_private,
            default_branch, stars, forks, contributor_count, created_at
     FROM repositories
     ORDER BY created_at DESC`,
  );
  return rows.map(toTracked);
}

export async function getTrackedRepository(id: string): Promise<TrackedRepository> {
  const { rows } = await pool.query(
    `SELECT id, github_id, owner, name, full_name, is_private,
            default_branch, stars, forks, contributor_count, created_at
     FROM repositories
     WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('Repository not found');
  return toTracked(row);
}