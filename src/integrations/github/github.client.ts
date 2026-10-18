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

export async function listAuthenticatedUserRepos(
  token: string,
  page = 1,
  perPage = 100,
): Promise<GitHubRepo[]> {
  return ghFetch<GitHubRepo[]>(
    `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator`,
    token,
  );
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

// ─── Phase 3 (extended): contributed repos via commit search ────────────

type SearchCommitItem = {
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
    default_branch: string;
    stargazers_count: number;
    forks_count: number;
  };
};

type SearchCommitsResponse = {
  total_count: number;
  items: SearchCommitItem[];
};

/**
 * Uses GitHub's commit search to find repos the user has committed to.
 * Returns deduplicated GitHubRepo objects. Caps at 2 pages of 100 commits.
 * Best-effort: returns [] on failure (search can be rate-limited separately).
 */
export async function listContributedRepos(
  token: string,
  username: string,
  maxPages = 2,
): Promise<GitHubRepo[]> {
  const seen = new Map<number, GitHubRepo>();
  const q = encodeURIComponent(`author:${username}`);

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const data = await ghFetch<SearchCommitsResponse>(
        `/search/commits?q=${q}&per_page=100&page=${page}`,
        token,
      );

      for (const item of data.items) {
        const r = item.repository;
        if (!seen.has(r.id)) {
          seen.set(r.id, {
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            owner: { login: r.owner.login },
            private: r.private,
            default_branch: r.default_branch,
            stargazers_count: r.stargazers_count,
            forks_count: r.forks_count,
          });
        }
      }

      // Stop if we've consumed everything
      if (data.items.length < 100) break;
      if (page * 100 >= data.total_count) break;
    }
  } catch {
    // Search rate-limit or failure: fall back to what we already have
  }

  return Array.from(seen.values());
}