import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const RENOVATE_CONFIGS = [
  'renovate.json',
  'renovate.json5',
  '.renovaterc',
  '.renovaterc.json',
  '.github/renovate.json',
  '.github/renovate.json5',
];

export const renovateDetector: ToolDetector = {
  name: 'renovate',
  category: 'dependencies',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    const found = RENOVATE_CONFIGS.filter((f) => f in ctx.configFiles);
    if (found.length > 0) {
      detected = true;
      evidence.configFiles = found;
    }

    // Renovate is often declared in package.json via "renovate" key or
    // installed as a CLI in devDependencies.
    const pkgRaw = ctx.configFiles['package.json'];
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw) as {
          devDependencies?: Record<string, string>;
          dependencies?: Record<string, string>;
        };
        if (
          Boolean(pkg.devDependencies?.renovate) ||
          Boolean(pkg.dependencies?.renovate)
        ) {
          detected = true;
          evidence.dependencyFiles = ['package.json'];
        }
      } catch {
        /* ignore */
      }
    }

    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    if (detected) {
      const DEP_FILE_RE =
        /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|pyproject\.toml|go\.mod|go\.sum|Gemfile|Gemfile\.lock|composer\.json|composer\.lock)$/;
      for (const commit of ctx.commits) {
        if (!commit.authorLogin) continue;
        if (commit.files.some((f) => DEP_FILE_RE.test(f.filename))) {
          perContributor[commit.authorLogin] = true;
        }
      }
    }

    const contributorLogins = ctx.contributors.map((c) => c.login);
    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0 && detected
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    return {
      tool: 'renovate',
      category: 'dependencies',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};