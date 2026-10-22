import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const PHP_TEST_FILE_RE = /Test\.php$/;

export const phpunitDetector: ToolDetector = {
  name: 'phpunit',
  category: 'testing',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    const CONFIGS = ['phpunit.xml', 'phpunit.xml.dist'];
    const found = CONFIGS.filter((f) => f in ctx.configFiles);
    if (found.length > 0) {
      detected = true;
      evidence.configFiles = found;
    }

    // composer.json dev dependency
    const composer = ctx.configFiles['composer.json'];
    if (composer) {
      try {
        const c = JSON.parse(composer) as {
          require?: Record<string, string>;
          'require-dev'?: Record<string, string>;
        };
        if (c['require-dev']?.['phpunit/phpunit'] || c.require?.['phpunit/phpunit']) {
          detected = true;
          evidence.dependencyFiles = ['composer.json'];
        }
      } catch {
        /* ignore */
      }
    }

    // CI runs phpunit / vendor/bin/phpunit
    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\bphpunit\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // Per-contributor: touched a Test.php
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      if (commit.files.some((f) => PHP_TEST_FILE_RE.test(f.filename))) {
        perContributor[commit.authorLogin] = true;
      }
    }

    // Suppress on non-PHP projects
    const isPhpProject =
      'composer.json' in ctx.configFiles ||
      ctx.rootFiles.some((f) => f.endsWith('.php'));
    if (!isPhpProject) {
      return {
        tool: 'phpunit',
        category: 'testing',
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
      tool: 'phpunit',
      category: 'testing',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};