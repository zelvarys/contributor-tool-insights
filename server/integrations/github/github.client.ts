import type { GitHubUser, GitHubEmail } from './github.types.js';

const API = 'https://api.github.com';
const GRAPHQL = 'https://api.github.com/graphql';

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
      'User-Agent': 'repo-tool-insights',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function ghGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'repo-tool-insights',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub GraphQL ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${json.errors[0]!.message}`);
  }
  if (!json.data) throw new Error('GitHub GraphQL returned no data');
  return json.data;
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

type ContributedRepoNode = {
  repository: {
    nameWithOwner: string; // "owner/name"
  };
};

type ContributionsQueryResult = {
  user: {
    contributionsCollection: {
      commitContributionsByRepository: ContributedRepoNode[];
    } | null;
  } | null;
};

const CONTRIBUTED_REPOS_QUERY = `
  query ContributedRepos($login: String!) {
    user(login: $login) {
      contributionsCollection {
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            nameWithOwner
          }
        }
      }
    }
  }
`;

/**
 * Fetch the set of "owner/name" strings the user has committed to in the
 * last year, in one GraphQL round-trip.
 */
async function fetchContributedRepoSet(
  token: string,
  userLogin: string,
): Promise<Set<string>> {
  try {
    const data = await ghGraphql<ContributionsQueryResult>(
      CONTRIBUTED_REPOS_QUERY,
      { login: userLogin },
      token,
    );
    const nodes = data.user?.contributionsCollection?.commitContributionsByRepository ?? [];
    return new Set(nodes.map((n) => n.repository.nameWithOwner));
  } catch {
    // GraphQL may fail on brand-new accounts with no contribution data.
    // Fall back to an empty set — the caller still shows owned + collaborator repos.
    return new Set();
  }
}

/**
 * Returns repos you own, are a collaborator on, or have contributed to
 * within an organisation you belong to.
 *
 * - Owned repos: always kept.
 * - Collaborator repos: always kept.
 * - Org repos: kept only if they appear in the user's
 *   commitContributionsByRepository set (single GraphQL query).
 *
 * This replaces the previous N+1 REST loop (one /commits call per org repo).
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

  const contributed = await fetchContributedRepoSet(token, userLogin);

  return repos.filter((repo) => {
    if (repo.owner.login === userLogin) return true;
    return contributed.has(repo.full_name);
  });
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
          'User-Agent': 'repo-tool-insights',
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

// ─── Phase 5: scan data ─────────────────────────────────────────────────

export type GitHubCommitListItem = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    } | null;
  };
  author: { login: string } | null;
};

export type GitHubCommitDetail = {
  sha: string;
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }>;
};

export type GitHubContributor = {
  login: string;
  id: number;
  contributions: number;
  avatar_url: string;
};

export type GitHubContentEntry = {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  sha: string;
  size?: number;
};

export async function fetchRecentCommits(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  maxPages = 3,
): Promise<GitHubCommitListItem[]> {
  const all: GitHubCommitListItem[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await ghFetch<GitHubCommitListItem[]>(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100&page=${page}`,
      token,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function fetchCommitDetail(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubCommitDetail> {
  return ghFetch<GitHubCommitDetail>(`/repos/${owner}/${repo}/commits/${sha}`, token);
}

export async function fetchContributors(
  token: string,
  owner: string,
  repo: string,
  maxPages = 2,
): Promise<GitHubContributor[]> {
  const all: GitHubContributor[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await ghFetch<GitHubContributor[]>(
      `/repos/${owner}/${repo}/contributors?per_page=100&page=${page}&anon=false`,
      token,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function listContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<GitHubContentEntry[]> {
  try {
    const data = await ghFetch<GitHubContentEntry[] | GitHubContentEntry>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

export async function readFileText(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const data = await ghFetch<
      | { type: 'file'; content: string; encoding: string }
      | GitHubContentEntry[]
    >(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    if (Array.isArray(data)) return null;
    if (data.type !== 'file') return null;
    if (data.encoding !== 'base64') return null;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}