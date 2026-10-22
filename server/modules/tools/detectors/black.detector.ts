import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const PY_SOURCE_RE = /\.py$/;

export const blackDetector: ToolDetector = {
  name: 'black',
  category: 'linting',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    // 1. pyproject.toml [tool.black]
    const pyproject = ctx.configFiles['pyproject.toml'];
    if (pyproject && /\[tool\.black\]/.test(pyproject)) {
      detected = true;
      evidence.configFiles = ['pyproject.toml'];
    }

    // 2. setup.cfg [tool:black]
    const setupCfg = ctx.configFiles['setup.cfg'];
    if (setupCfg && /\[tool:black\]/.test(setupCfg)) {
      detected = true;
      evidence.configFiles = [...(evidence.configFiles ?? []), 'setup.cfg'];
    }

    // 3. requirements.txt / setup.py / tox.ini mentions black
    const reqs = ctx.configFiles['requirements.txt'];
    if (reqs && /\bblack\b/.test(reqs)) {
      detected = true;
      evidence.dependencyFiles = ['requirements.txt'];
    }
    const setupPy = ctx.configFiles['setup.py'];
    if (setupPy && /\bblack\b/.test(setupPy)) {
      detected = true;
      evidence.dependencyFiles = [
        ...(evidence.dependencyFiles ?? []),
        'setup.py',
      ];
    }
    const tox = ctx.configFiles['tox.ini'];
    if (tox && /\bblack\b/.test(tox)) {
      detected = true;
      evidence.dependencyFiles = [
        ...(evidence.dependencyFiles ?? []),
        'tox.ini',
      ];
    }

    // 4. CI runs black
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\bblack\b/.test(text)) workflowHits.push(wf);
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
      tool: 'black',
      category: 'linting',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};