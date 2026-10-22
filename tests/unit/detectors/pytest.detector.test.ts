import { describe, it, expect } from 'vitest';
import { pytestDetector } from '../../../server/modules/tools/detectors/pytest.detector.js';
import { buildScanContext, buildCommit } from '../../helpers/context.js';

describe('pytestDetector', () => {
  it('detects from pytest.ini', async () => {
    const ctx = buildScanContext({
      configFiles: { 'pytest.ini': '[pytest]\ntestpaths = tests\n' },
    });

    const result = await pytestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.configFiles).toContain('pytest.ini');
  });

  it('detects from pyproject.toml [tool.pytest]', async () => {
    const ctx = buildScanContext({
      configFiles: {
        'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      },
    });

    const result = await pytestDetector.detect(ctx);

    expect(result.detected).toBe(true);
  });

  it('detects from requirements.txt', async () => {
    const ctx = buildScanContext({
      configFiles: { 'requirements.txt': 'pytest==8.0.0\npytest-cov==5.0.0\n' },
    });

    const result = await pytestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.dependencyFiles).toContain('requirements.txt');
  });

  it('detects from CI workflow', async () => {
    const ctx = buildScanContext({
      workflowFiles: ['.github/workflows/test.yml'],
      configFiles: {
        '.github/workflows/test.yml': 'jobs:\n  test:\n    steps:\n      - run: pytest\n',
      },
    });

    const result = await pytestDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.evidence.ciWorkflows).toContain('.github/workflows/test.yml');
  });

  it('computes per-contributor adoption from test file commits', async () => {
    const ctx = buildScanContext({
      configFiles: { 'pytest.ini': '' },
      contributors: [
        { login: 'alice', contributions: 3 },
        { login: 'bob', contributions: 3 },
        { login: 'carol', contributions: 3 },
      ],
      commits: [
        buildCommit({ authorLogin: 'alice', filenames: ['tests/test_foo.py'] }),
        buildCommit({ authorLogin: 'bob', filenames: ['src/foo_test.py'] }),
        buildCommit({ authorLogin: 'carol', filenames: ['src/foo.py'] }),
      ],
    });

    const result = await pytestDetector.detect(ctx);

    expect(result.perContributor).toEqual({
      alice: true,
      bob: true,
      carol: false,
    });
    expect(result.adoptionRate).toBeCloseTo(66.67, 1);
  });

  it('not detected without any pytest signal', async () => {
    const ctx = buildScanContext({
      configFiles: { 'requirements.txt': 'requests==2.0.0\n' },
    });

    const result = await pytestDetector.detect(ctx);

    expect(result.detected).toBe(false);
  });
});