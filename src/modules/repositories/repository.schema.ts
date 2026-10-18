export type AddRepositoryInput = {
  githubId: number;
};

export function parseAddRepositoryBody(body: unknown): AddRepositoryInput {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be an object');
  }

  const githubId = (body as Record<string, unknown>).githubId;
  if (typeof githubId !== 'number' || !Number.isInteger(githubId) || githubId <= 0) {
    throw new Error('githubId must be a positive integer');
  }

  return { githubId };
}

export function parseRepoIdParam(param: string | undefined): string {
  if (!param || typeof param !== 'string') {
    throw new Error('Repository id is required');
  }
  // Basic UUID shape check
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)) {
    throw new Error('Invalid repository id');
  }
  return param;
}