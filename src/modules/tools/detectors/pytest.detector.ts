import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const PY_TEST_FILE_RE = /(^|\/)(tests?\/|.*_test\.py$|.*test_.*\.py$|test_.*\.py$)/;

export const pytestDetector: ToolDetector = {
  name: 'pytest',
  category: 'testing',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    // 1. pytest.ini / tox.ini / setup.cfg / pyproject.toml
    const configCandidates = ['pytest.ini', 'tox.ini', 'setup.cfg'];
    const foundConfigs = configCandidates.filter((f) => f in ctx.configFiles);
    if (foundConfigs.length > 0) {
      // pytest.ini is definitive; tox.ini/setup.cfg need [pytest] / [tool:pytest]
      for (const cfg of foundConfigs) {
        const text = ctx.configFiles[cfg]!;
        if (cfg === 'pytest.ini' || /\[(tool:)?pytest\]/.test(text)) {
          detected = true;
        }
      }
      if (detected) evidence.configFiles = foundConfigs;
    }

    // 2. pyproject.toml [tool.pytest]
    const pyproject = ctx.configFiles['pyproject.toml'];
    if (pyproject && /\[tool\.pytest/.test(pyproject)) {
      detected = true;
      evidence.configFiles = [...(evidence.configFiles ?? []), 'pyproject.toml'];
    }

    // 3. requirements.txt / setup.py mention pytest
    const reqs = ctx.configFiles['requirements.txt'];
    if (reqs && /\bpytest\b/.test(reqs)) {
      detected = true;
      evidence.dependencyFiles = ['requirements.txt'];
    }
    const setupPy = ctx.configFiles['setup.py'];
    if (setupPy && /\bpytest\b/.test(setupPy)) {
      detected = true;
      evidence.dependencyFiles = [
        ...(evidence.dependencyFiles ?? []),
        'setup.py',
      ];
    }

    // 4. CI runs pytest
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\bpytest\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // 5. Per-contributor: touched test files
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      const touched = commit.files.some((f) => PY_TEST_FILE_RE.test(f.filename));
      if (touched) perContributor[commit.authorLogin] = true;
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'pytest',
      category: 'testing',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};