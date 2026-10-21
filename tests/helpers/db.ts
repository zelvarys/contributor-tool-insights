import { pool } from '../../src/config/database.js';

export async function truncateAll(): Promise<void> {
  await pool.query(
    'TRUNCATE tool_usage, tracked_tools, scans, repositories, users RESTART IDENTITY CASCADE',
  );
}

export async function insertUser(opts: {
  githubId: number;
  username: string;
  accessTokenCiphertext?: string;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (github_id, username, access_token)
     VALUES ($1, $2, $3) RETURNING id`,
    [opts.githubId, opts.username, opts.accessTokenCiphertext ?? 'cipher'],
  );
  return rows[0]!.id;
}

export async function insertRepository(opts: {
  githubId: number;
  owner: string;
  name: string;
  addedBy: string;
  contributorCount?: number;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO repositories
       (github_id, owner, name, full_name, contributor_count, added_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      opts.githubId,
      opts.owner,
      opts.name,
      `${opts.owner}/${opts.name}`,
      opts.contributorCount ?? 0,
      opts.addedBy,
    ],
  );
  return rows[0]!.id;
}