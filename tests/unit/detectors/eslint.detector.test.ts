import { describe, it, expect } from 'vitest';
import { eslintDetector } from '../../../src/modules/tools/detectors/eslint.detector.js';
import { buildScanContext, buildCommit } from '../../helpers/context.js';

describe('eslintDetector', () => {
  it('detects from .eslintrc.json', async () => {
    const ctx = buildScanContext({
      configFiles: { '.eslintrc.json': '{"env":{"node":true}}' },
    });

    const result = await eslintDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.configFiles).toContain('.eslintrc.json');
    expect(result.category).toBe('linting');
  });

  it('detects from flat config', async () => {
    const ctx = buildScanContext({
      configFiles: { 'eslint.config.js': 'export default [];' },
    });

    const result = await eslintDetector.detect(ctx);

    expect(result.detected).toBe(true);
  });

  it('detects from package.json dependency', async () => {
    const ctx = buildScanContext({
      configFiles: {
        'package.json': JSON.stringify({ devDependencies: { eslint: '^9' } }),
      },
    });

    const result = await eslintDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.dependencyFiles).toContain('package.json');
  });

  it('computes per-contributor adoption from lintable files', async () => {
    const ctx = buildScanContext({
      configFiles: { '.eslintrc.json': '{}' },
      contributors: [
        { login: 'alice', contributions: 5 },
        { login: 'bob', contributions: 5 },
      ],
      commits: [
        buildCommit({ authorLogin: 'alice', filenames: ['src/a.ts'] }),
        buildCommit({ authorLogin: 'bob', filenames: ['README.md'] }),
      ],
    });

    const result = await eslintDetector.detect(ctx);

    expect(result.perContributor).toEqual({ alice: true, bob: false });
    expect(result.adoptionRate).toBe(50);
  });

  it('not detected without config or dependency', async () => {
    const ctx = buildScanContext({
      configFiles: { 'package.json': JSON.stringify({ dependencies: {} }) },
    });

    const result = await eslintDetector.detect(ctx);

    expect(result.detected).toBe(false);
    expect(result.adoptionRate).toBe(0);
  });
});