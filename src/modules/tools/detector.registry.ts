import type { ToolDetector } from './detector.interface.js';
import { jestDetector } from './detectors/jest.detector.js';
import { eslintDetector } from './detectors/eslint.detector.js';
import { prettierDetector } from './detectors/prettier.detector.js';
import { pytestDetector } from './detectors/pytest.detector.js';
import { blackDetector } from './detectors/black.detector.js';
import { ruffDetector } from './detectors/ruff.detector.js';
import { preCommitDetector } from './detectors/pre-commit.detector.js';
import { githubActionsDetector } from './detectors/github-actions.detector.js';
import { dependabotDetector } from './detectors/dependabot.detector.js';
import { renovateDetector } from './detectors/renovate.detector.js';
import { goTestDetector } from './detectors/go-test.detector.js';
import { golangciLintDetector } from './detectors/golangci-lint.detector.js';
import { phpunitDetector } from './detectors/phpunit.detector.js';

export const detectors: ToolDetector[] = [
  jestDetector,
  eslintDetector,
  prettierDetector,
  pytestDetector,
  blackDetector,
  ruffDetector,
  preCommitDetector,
  githubActionsDetector,
  dependabotDetector,
  renovateDetector,
  goTestDetector,
  golangciLintDetector,
  phpunitDetector,
];