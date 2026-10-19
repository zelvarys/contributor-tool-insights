import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const GO_SOURCE_RE = /\.go$/;

export const golangciLintDetector: ToolDetector = {
  name: 'golangci-lint',
  category: 'linting',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    const CONFIGS = [
      '.golangci.yml',
      '.golangci.yaml',
      '.golangci.toml',
      '.golangci.json',
    ];
    const found = CONFIGS.filter((f) => f in ctx.configFiles);
    if (found.length > 0) {
      detected = true;
      evidence.configFiles = found;
    }

    // CI runs golangci-lint
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /golangci-lint/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // Per-contributor: touched Go sources
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      if (commit.files.some((f) => GO_SOURCE_RE.test(f.filename))) {
        perContributor[commit.authorLogin] = true;
      }
    }

    // Suppress on non-Go projects
    const isGoProject =
      'go.mod' in ctx.configFiles || ctx.rootFiles.some((f) => f.endsWith('.go'));
    if (!isGoProject) {
      return {
        tool: 'golangci-lint',
        category: 'linting',
        detected: false,
        adoptionRate: 0,
        evidence,
        perContributor: {},
      };
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'golangci-lint',
      category: 'linting',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};