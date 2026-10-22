import { describe, it, expect } from 'vitest';
import { jestDetector } from '../../../server/modules/tools/detectors/jest.detector.js';
import { buildScanContext, buildCommit } from '../../helpers/context.js';

describe('jestDetector', () => {
  it('detects jest from config file', async () => {
    const ctx = buildScanContext({
      configFiles: { 'jest.config.js': 'module.exports = {};' },
      contributors: [{ login: 'alice', contributions: 5 }],
    });

    const result = await jestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.configFiles).toContain('jest.config.js');
    expect(result.category).toBe('testing');
    expect(result.tool).toBe('jest');
  });

  it('detects jest from package.json dependency', async () => {
    const ctx = buildScanContext({
      configFiles: {
        'package.json': JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
      },
    });

    const result = await jestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.dependencyFiles).toContain('package.json');
  });

  it('detects jest from package.json scripts', async () => {
    const ctx = buildScanContext({
      configFiles: {
        'package.json': JSON.stringify({ scripts: { test: 'jest --coverage' } }),
      },
    });

    const result = await jestDetector.detect(ctx);

    expect(result.detected).toBe(true);
  });

  it('detects jest from workflow invocation', async () => {
    const ctx = buildScanContext({
      workflowFiles: ['.github/workflows/ci.yml'],
      configFiles: {
        '.github/workflows/ci.yml': 'jobs:\n  test:\n    steps:\n      - run: npm test\n',
      },
    });

    const result = await jestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.ciWorkflows).toContain('.github/workflows/ci.yml');
  });

  it('returns detected=false when jest is not present', async () => {
    const ctx = buildScanContext({
      configFiles: { 'package.json': JSON.stringify({ dependencies: { react: '18' } }) },
    });

    const result = await jestDetector.detect(ctx);

    expect(result.detected).toBe(false);
    expect(result.adoptionRate).toBe(0);
  });

  it('computes adoptionRate from test-file commits', async () => {
    const ctx = buildScanContext({
      configFiles: { 'jest.config.js': 'module.exports = {};' },
      contributors: [
        { login: 'alice', contributions: 10 },
        { login: 'bob', contributions: 5 },
        { login: 'carol', contributions: 2 },
      ],
      commits: [
        buildCommit({ authorLogin: 'alice', filenames: ['src/foo.test.ts'] }),
        buildCommit({ authorLogin: 'bob', filenames: ['src/bar.test.ts'] }),
        buildCommit({ authorLogin: 'carol', filenames: ['src/baz.ts'] }),
      ],
    });

    const result = await jestDetector.detect(ctx);

    // alice + bob used jest (2 of 3)
    expect(result.adoptionRate).toBeCloseTo(66.67, 1);
    expect(result.perContributor).toEqual({
      alice: true,
      bob: true,
      carol: false,
    });
  });

  it('sets adoptionRate=0 when detected but no contributors', async () => {
    const ctx = buildScanContext({
      configFiles: { 'jest.config.js': '' },
      contributors: [],
      commits: [],
    });

    const result = await jestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.adoptionRate).toBe(0);
  });
});