import type { ToolDetector } from './detector.interface.js';
import { jestDetector } from './detectors/jest.detector.js';

export const detectors: ToolDetector[] = [
  jestDetector,
  // Phase 7 will append: eslintDetector, pytestDetector, blackDetector,
  // githubActionsDetector
];