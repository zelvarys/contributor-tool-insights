import { pool } from '../../server/config/database.js';

const KNOWN_APP_DATABASES = new Set(['repo_insights', 'postgres']);

export function assertTestDatabase(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `truncateAll() refused: NODE_ENV must be "test" (got "${process.env.NODE_ENV ?? 'undefined'}"). ` +
        'Set NODE_ENV=test or load .env.test before running tests.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'truncateAll() refused: DATABASE_URL is not set. ' +
        'Create repo_insights_test and set DATABASE_URL=postgres://<user>@localhost:5432/repo_insights_test, ' +
        'or set ALLOW_TEST_TRUNCATE=1 to override the _test suffix check.',
    );
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(
      'truncateAll() refused: DATABASE_URL is not a valid URL. ' +
        'Set DATABASE_URL=postgres://<user>@localhost:5432/repo_insights_test.',
    );
  }

  if (!databaseName.endsWith('_test') && process.env.ALLOW_TEST_TRUNCATE !== '1') {
    throw new Error(
      `truncateAll() refused: database "${databaseName}" does not end in _test. ` +
        'Create repo_insights_test and point DATABASE_URL at it, ' +
        'or set ALLOW_TEST_TRUNCATE=1 to override the suffix check.',
    );
  }

  if (KNOWN_APP_DATABASES.has(databaseName)) {
    throw new Error(
      `truncateAll() refused: database "${databaseName}" is an application database. ` +
        'Create repo_insights_test and point DATABASE_URL at it.',
    );
  }
}

export async function truncateAll(): Promise<void> {
  assertTestDatabase();
  await pool.query(
    'TRUNCATE tool_usage, tracked_tools, scans, repositories, users RESTART IDENTITY CASCADE',
  );
}

export async function insertUser(opts: {
  githubId: number;
  username: string;
  accessTokenCiphertext?: string;
}): Promise<string> {
  assertTestDatabase();
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
  assertTestDatabase();
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