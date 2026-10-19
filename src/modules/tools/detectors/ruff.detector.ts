import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const PY_SOURCE_RE = /\.py$/;

export const ruffDetector: ToolDetector = {
  name: 'ruff',
  category: 'linting',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    // 1. ruff.toml / .ruff.toml
    const found = ['ruff.toml', '.ruff.toml'].filter((f) => f in ctx.configFiles);
    if (found.length > 0) {
      detected = true;
      evidence.configFiles = found;
    }

    // 2. pyproject.toml [tool.ruff]
    const pyproject = ctx.configFiles['pyproject.toml'];
    if (pyproject && /\[tool\.ruff/.test(pyproject)) {
      detected = true;
      evidence.configFiles = [...(evidence.configFiles ?? []), 'pyproject.toml'];
    }

    // 3. requirements.txt mentions ruff
    const reqs = ctx.configFiles['requirements.txt'];
    if (reqs && /\bruff\b/.test(reqs)) {
      detected = true;
      evidence.dependencyFiles = ['requirements.txt'];
    }

    // 4. CI runs ruff
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\bruff\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // 5. Per-contributor: touched Python sources
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      const touched = commit.files.some((f) => PY_SOURCE_RE.test(f.filename));
      if (touched) perContributor[commit.authorLogin] = true;
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'ruff',
      category: 'linting',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};