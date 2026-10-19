import type { ScanContext } from '../scans/scan.context.js';

export type ToolCategory =
  | 'testing'
  | 'linting'
  | 'ci_cd'
  | 'coverage'
  | 'docs'
  | 'dependencies';

export type DetectionResult = {
  tool: string;
  category: ToolCategory;
  detected: boolean;
  /** 0–100, two decimals. 0 when `detected` is false or no contributors. */
  adoptionRate: number;
  evidence: {
    configFiles?: string[];
    dependencyFiles?: string[];
    ciWorkflows?: string[];
    commits?: string[];
  };
  /** login → did this contributor show evidence of using the tool */
  perContributor?: Record<string, boolean>;
};

export interface ToolDetector {
  name: string;
  category: ToolCategory;
  detect(ctx: ScanContext): Promise<DetectionResult>;
}