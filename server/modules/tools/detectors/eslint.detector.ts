import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const LINTABLE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/;

const ESLINT_CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
];

export const eslintDetector: ToolDetector = {
  name: 'eslint',
  category: 'linting',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    const foundConfigs = ESLINT_CONFIG_FILES.filter((f) => f in ctx.configFiles);
    if (foundConfigs.length > 0) {
      detected = true;
      evidence.configFiles = foundConfigs;
    }

    const pkgRaw = ctx.configFiles['package.json'];
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          scripts?: Record<string, string>;
        };
        const hasDep =
          Boolean(pkg.devDependencies?.eslint) || Boolean(pkg.dependencies?.eslint);
        const hasScript = Object.values(pkg.scripts ?? {}).some((s) =>
          /\beslint\b/.test(s),
        );
        if (hasDep || hasScript) {
          detected = true;
          evidence.dependencyFiles = ['package.json'];
        }
      } catch {
        /* ignore */
      }
    }

    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\beslint\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      const touchedLintable = commit.files.some((f) =>
        LINTABLE_FILE_RE.test(f.filename),
      );
      if (touchedLintable) perContributor[commit.authorLogin] = true;
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'eslint',
      category: 'linting',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};