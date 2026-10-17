import { env } from '../../config/env.js';

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    scope: 'read:user user:email repo',
    state,
  });
  return `${GITHUB_AUTHORIZE}?${params.toString()}`;
}

export type GitHubTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
};

export async function exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
  const res = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_CALLBACK_URL,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as Partial<GitHubTokenResponse> & { error?: string };
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token exchange error: ${data.error ?? 'no access_token'}`);
  }
  return data as GitHubTokenResponse;
}