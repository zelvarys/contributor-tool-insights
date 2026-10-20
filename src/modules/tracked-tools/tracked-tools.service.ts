import { pool } from '../../config/database.js';
import { getTrackedRepository } from '../repositories/repository.service.js';
import { badRequest } from '../../utils/errors.js';
import { detectors } from '../tools/detector.registry.js';

export type TrackedToolRow = {
  toolName: string;
  enabled: boolean;
  detected: boolean;
  relevant: boolean;
  category: string;
};

/**
 * Returns all 13 registry tools for the repo, joined with the user's
 * current tracking state. Rows that don't yet exist in tracked_tools
 * are returned with `enabled = false` (they'll be backfilled by the
 * scan worker when detected + relevant).
 */
export async function listTrackedTools(repoId: string): Promise<TrackedToolRow[]> {
  await getTrackedRepository(repoId); // 404 if missing

  // Latest completed scan for detection data
  const latestScan = await pool.query<{ id: string }>(
    `SELECT id FROM scans
     WHERE repo_id = $1 AND status = 'complete'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [repoId],
  );
  const scanId = latestScan.rows[0]?.id;

  // Detected set + categories from tool_usage
  const detectedMap = new Map<string, { detected: boolean; category: string }>();
  if (scanId) {
    const detectionRows = await pool.query<{
      tool_name: string;
      category: string;
      detected: boolean;
    }>(
      `SELECT tool_name, category, detected
       FROM tool_usage
       WHERE scan_id = $1 AND contributor_login IS NULL`,
      [scanId],
    );
    for (const r of detectionRows.rows) {
      detectedMap.set(r.tool_name, {
        detected: r.detected,
        category: r.category,
      });
    }
  }

  // Current tracked set
  const trackedRows = await pool.query<{
    tool_name: string;
    enabled: boolean;
  }>(
    `SELECT tool_name, enabled FROM tracked_tools WHERE repo_id = $1`,
    [repoId],
  );
  const trackedMap = new Map<string, boolean>();
  for (const r of trackedRows.rows) trackedMap.set(r.tool_name, r.enabled);

  // Compose response: one row per registry tool
  return detectors.map((detector) => {
    const detectedInfo = detectedMap.get(detector.name);
    const enabled = trackedMap.get(detector.name) ?? false;
    // `relevant` is derived by metrics.service based on languages; here
    // we only need the boolean for the UI's dim/hide decision. For now
    // treat as relevant if detected — metrics still owns the authoritative
    // relevant flag.
    return {
      toolName: detector.name,
      enabled,
      detected: detectedInfo?.detected ?? false,
      relevant: detectedInfo?.detected ?? false,
      category: detectedInfo?.category ?? detector.category,
    };
  });
}

export type UpdateTrackedToolsInput = {
  tools: Array<{ name: string; enabled: boolean }>;
};

/**
 * Upserts the full set: any tool mentioned gets created/updated, any
 * tool not mentioned is deleted. This is a "replace" operation to keep
 * the UI simple — the client always sends the complete desired set.
 */
export async function replaceTrackedTools(
  repoId: string,
  input: UpdateTrackedToolsInput,
): Promise<TrackedToolRow[]> {
  await getTrackedRepository(repoId); // 404 if missing

  const knownNames = new Set(detectors.map((d) => d.name));
  const cleaned: Array<{ name: string; enabled: boolean }> = [];
  const seen = new Set<string>();

  for (const t of input.tools) {
    if (typeof t.name !== 'string' || t.name.length === 0) {
      throw badRequest('Each tool must have a name');
    }
    if (typeof t.enabled !== 'boolean') {
      throw badRequest(`Tool ${t.name}: enabled must be boolean`);
    }
    if (!knownNames.has(t.name)) {
      throw badRequest(`Unknown tool: ${t.name}`);
    }
    if (seen.has(t.name)) {
      throw badRequest(`Duplicate tool in request: ${t.name}`);
    }
    seen.add(t.name);
    cleaned.push(t);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete tools not in the request
    const keepNames = cleaned.map((t) => t.name);
    if (keepNames.length > 0) {
      await client.query(
        `DELETE FROM tracked_tools
         WHERE repo_id = $1 AND tool_name <> ALL($2::text[])`,
        [repoId, keepNames],
      );
    } else {
      await client.query('DELETE FROM tracked_tools WHERE repo_id = $1', [repoId]);
    }

    // Upsert each
    for (const t of cleaned) {
      await client.query(
        `INSERT INTO tracked_tools (repo_id, tool_name, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (repo_id, tool_name) DO UPDATE
           SET enabled = EXCLUDED.enabled,
               updated_at = NOW()`,
        [repoId, t.name, t.enabled],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return listTrackedTools(repoId);
}

/**
 * Called by the scan worker after persisting tool_usage rows.
 * For every detected-and-relevant tool that isn't yet in tracked_tools,
 * insert it with enabled = true. Existing rows are left untouched —
 * the user's explicit choices always win.
 *
 * Language relevance detection is duplicated here (small, self-contained)
 * rather than imported from metrics.service to keep the worker's import
 * graph free of metrics concerns.
 */
export async function backfillTrackedToolsFromScan(
  repoId: string,
  toolUsage: Array<{ toolName: string; detected: boolean; category: string }>,
  languages: { js: boolean; python: boolean; go: boolean; php: boolean },
): Promise<void> {
  const JS_TOOLS = new Set(['jest', 'eslint', 'prettier']);
  const PYTHON_TOOLS = new Set(['pytest', 'black', 'ruff']);
  const GO_TOOLS = new Set(['go-test', 'golangci-lint']);
  const PHP_TOOLS = new Set(['phpunit']);

  const isRelevant = (name: string): boolean => {
    if (JS_TOOLS.has(name)) return languages.js;
    if (PYTHON_TOOLS.has(name)) return languages.python;
    if (GO_TOOLS.has(name)) return languages.go;
    if (PHP_TOOLS.has(name)) return languages.php;
    return true;
  };

  const toBackfill = toolUsage.filter((t) => t.detected && isRelevant(t.toolName));
  if (toBackfill.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of toBackfill) {
      await client.query(
        `INSERT INTO tracked_tools (repo_id, tool_name, enabled)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (repo_id, tool_name) DO NOTHING`,
        [repoId, t.toolName],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}