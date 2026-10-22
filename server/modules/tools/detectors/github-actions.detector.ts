import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

export const githubActionsDetector: ToolDetector = {
  name: 'github-actions',
  category: 'ci_cd',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    const detected = ctx.workflowFiles.length > 0;

    if (detected) {
      evidence.ciWorkflows = ctx.workflowFiles;
    }

    // Per-contributor: for GitHub Actions there's no "running it locally" signal.
    // We approximate by checking whether contributors have commits that would
    // trigger workflows on the default branch (i.e. commits in the fetched window
    // on the default branch — which is what /commits returns by default).
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    if (detected) {
      for (const commit of ctx.commits) {
        if (commit.authorLogin) perContributor[commit.authorLogin] = true;
      }
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'github-actions',
      category: 'ci_cd',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};