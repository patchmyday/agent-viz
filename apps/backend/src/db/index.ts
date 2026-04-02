import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  if (process.env['DATA_DIR']) {
    return join(process.env['DATA_DIR'], 'data.db');
  }
  const xdgDataHome = process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share');
  return join(xdgDataHome, 'agent-viz', 'data.db');
}

function createDb() {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('cache_size = -65536');
  sqlite.pragma('mmap_size = 536870912');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle({ client: sqlite, schema });

  // Migrations folder is at <backend-root>/drizzle/, resolved relative to compiled output
  const migrationsFolder = join(__dirname, '../../drizzle');
  migrate(db, { migrationsFolder });

  return db;
}

export const db = createDb();
export type Db = typeof db;
