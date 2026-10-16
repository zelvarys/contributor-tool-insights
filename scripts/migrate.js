import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'src', 'db', 'migrations');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Ledger table
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await client.query('SELECT name FROM migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[SKIP] ${file}`);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`[APPLY] ${file}`);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[DONE] ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[FAIL] ${file}`, err.message);
      process.exit(1);
    }
  }

  await client.end();
  console.log('✅ Migrations complete');
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err);
  process.exit(1);
});