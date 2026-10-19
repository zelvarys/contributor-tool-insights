import type { ToolDetector, DetectionResult } from '../detector.interface.js';
import type { ScanContext } from '../../scans/scan.context.js';

const GO_TEST_FILE_RE = /_test\.go$/;
const GO_SOURCE_RE = /\.go$/;

export const goTestDetector: ToolDetector = {
  name: 'go-test',
  category: 'testing',

  async detect(ctx: ScanContext): Promise<DetectionResult> {
    const evidence: DetectionResult['evidence'] = {};
    let detected = false;

    // Go test has no config file. Detection is evidence-based:
    // - go.mod exists (Go project)
    // - _test.go files exist in the fetched commit window OR
    // - CI runs `go test`
    const hasGoMod = 'go.mod' in ctx.configFiles;

    if (hasGoMod) evidence.dependencyFiles = ['go.mod'];

    const touchedGoTest = ctx.commits.some((c) =>
      c.files.some((f) => GO_TEST_FILE_RE.test(f.filename)),
    );
    if (touchedGoTest) {
      detected = true;
      evidence.commits = ctx.commits
        .filter((c) => c.files.some((f) => GO_TEST_FILE_RE.test(f.filename)))
        .slice(0, 10)
        .map((c) => c.sha);
    }

    const workflowHits: string[] = [];
    for (const wf of ctx.workflowFiles) {
      const text = ctx.configFiles[wf];
      if (text && /\bgo\s+test\b/.test(text)) workflowHits.push(wf);
    }
    if (workflowHits.length > 0) {
      detected = true;
      evidence.ciWorkflows = workflowHits;
    }

    // Per-contributor: touched a _test.go file
    const perContributor: Record<string, boolean> = {};
    for (const c of ctx.contributors) perContributor[c.login] = false;

    for (const commit of ctx.commits) {
      if (!commit.authorLogin) continue;
      if (commit.files.some((f) => GO_TEST_FILE_RE.test(f.filename))) {
        perContributor[commit.authorLogin] = true;
      }
    }

    // If this isn't a Go project at all, suppress the detector entirely
    const isGoProject = hasGoMod || GO_SOURCE_RE.test(ctx.rootFiles.join(','));
    if (!isGoProject) {
      return {
        tool: 'go-test',
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
      tool: 'go-test',
      category: 'testing',
      detected,
      adoptionRate,
      evidence,
      perContributor,
    };
  },
};