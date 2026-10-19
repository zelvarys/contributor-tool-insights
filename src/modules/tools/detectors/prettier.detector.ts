import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const FORMATTABLE_FILE_RE =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|vue|svelte|yaml|yml)$/;

const PRETTIER_CONFIG_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
];

export const prettierDetector: ToolDetector = {
  name: 'prettier',
  category: 'linting',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    const foundConfigs = PRETTIER_CONFIG_FILES.filter((f) => f in ctx.configFiles);
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
          Boolean(pkg.devDependencies?.prettier) ||
          Boolean(pkg.dependencies?.prettier);
        const hasScript = Object.values(pkg.scripts ?? {}).some((s) =>
          /\bprettier\b/.test(s),
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
      if (text && /\bprettier\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      const touched = commit.files.some((f) =>
        FORMATTABLE_FILE_RE.test(f.filename),
      );
      if (touched) perContributor[commit.authorLogin] = true;
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'prettier',
      category: 'linting',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};