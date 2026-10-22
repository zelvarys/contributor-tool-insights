import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const TEST_FILE_RE = /(^|\/)(__tests__\/|.*\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$)/;

export const jestDetector: ToolDetector = {
  name: 'jest',
  category: 'testing',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    // 1. jest.config.*
    const configCandidates = [
      'jest.config.js',
      'jest.config.ts',
      'jest.config.mjs',
      'jest.config.cjs',
      'jest.config.json',
    ];
    const foundConfigs = configCandidates.filter((f) => f in ctx.configFiles);
    if (foundConfigs.length > 0) {
      detected = true;
      evidence.configFiles = foundConfigs;
    }

    // 2. jest in package.json devDependencies/dependencies
    const pkgRaw = ctx.configFiles['package.json'];
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          scripts?: Record<string, string>;
        };
        const hasJestDep =
          Boolean(pkg.devDependencies?.jest) || Boolean(pkg.dependencies?.jest);
        const hasJestScript = Object.values(pkg.scripts ?? {}).some((s) =>
          /\bjest\b/.test(s),
        );
        if (hasJestDep || hasJestScript) {
          detected = true;
          evidence.dependencyFiles = ['package.json'];
        }
      } catch {
        // Malformed package.json — ignore
      }
    }

    // 3. Jest invoked in a workflow
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\b(jest|npm (run )?test|yarn test|pnpm test)\b/.test(text)) {
        workflowHits.push(wf);
      }
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // 4. Per-contributor: touched a test file in the fetched commit window
    const perContributor: Record<string, boolean> = {};
    const contributorLogins = ctx.contributors.map((c) => c.login);

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      const touchedTests = commit.files.some((f) => TEST_FILE_RE.test(f.filename));
      if (touchedTests) perContributor[commit.authorLogin] = true;
    }

    for (const login of contributorLogins) {
      if (!(login in perContributor)) perContributor[login] = false;
    }

    const usingCount = Object.values(perContributor).filter(Boolean).length;
    const adoptionRate =
      contributorLogins.length > 0
        ? Math.round((usingCount / contributorLogins.length) * 10000) / 100
        : 0;

    // If Jest isn't configured at all, adoption is meaningless → 0
    if (!detected) {
      return {
        tool: 'jest',
        category: 'testing',
        detected: false,
        adoptionRate: 0,
        evidence,
        perContributor,
      };
    }

    return {
      tool: 'jest',
      category: 'testing',
      detected: true,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};