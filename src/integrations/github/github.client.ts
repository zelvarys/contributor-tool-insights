import type { GitHubUser, GitHubEmail } from './github.types.js';

const API = 'https://api.github.com';

async function ghFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'contributor-tool-insights',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ─── Phase 2: auth ──────────────────────────────────────────────────────

export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  return ghFetch<GitHubUser>('/user', token);
}

export async function getPrimaryEmail(token: string): Promise<string | null> {
  try {
    const emails = await ghFetch<GitHubEmail[]>('/user/emails', token);
    const primary = emails.find((e) => e.primary && e.verified);
    return primary?.email ?? emails[0]?.email ?? null;
  } catch {
    return null;
  }
}

// ─── Phase 3: repositories ──────────────────────────────────────────────

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
};

/**
 * Returns repos you own, are a collaborator on, or have contributed to
 * within an organisation you belong to.
 *
 * - Owned repos: always kept.
 * - Collaborator repos: always kept.
 * - Org repos: kept only if `userLogin` has at least one commit on the
 *   default branch. One request per org repo; skipped cheaply on error.
 */
export async function listAuthenticatedUserRepos(
  token: string,
  userLogin: string,
  page = 1,
  perPage = 100,
): Promise<GitHubRepo[]> {
  const repos = await ghFetch<GitHubRepo[]>(
    `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
    token,
  );

  const filtered: GitHubRepo[] = [];
  for (const repo of repos) {
    if (repo.owner.login === userLogin) {
      filtered.push(repo);
      continue;
    }

    // Org/collaborator repo — only keep if userLogin has a commit on it.
    try {
      const commits = await ghFetch<unknown[]>(
        `/repos/${repo.owner.login}/${repo.name}/commits?author=${userLogin}&per_page=1`,
        token,
      );
      if (commits.length > 0) filtered.push(repo);
    } catch {
      // Empty repo (409), no access (404), rate-limited (403) — skip
    }
  }

  return filtered;
}

export async function getRepo(
  token: string,
  owner: string,
  repo: string,
): Promise<GitHubRepo> {
  return ghFetch<GitHubRepo>(`/repos/${owner}/${repo}`, token);
}

export async function getContributorCount(
  token: string,
  owner: string,
  repo: string,
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=false`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'contributor-tool-insights',
        },
      },
    );
    if (!res.ok) return 0;

    const link = res.headers.get('link');
    if (link) {
      const match = /page=(\d+)>; rel="last"/.exec(link);
      if (match) return Number(match[1]);
    }

    const data = (await res.json()) as unknown[];
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}