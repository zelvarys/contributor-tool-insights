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
    // Scope might not include user:email, or no emails visible — non-fatal
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
    `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
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
    // Fetch first page only; count via Link header "last" if present, else length
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