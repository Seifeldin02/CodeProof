import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Thin SQLite wrapper using Node's built-in `node:sqlite` (no native module to
 * compile). The database file lives under `server/data/` and is seeded at
 * startup — see `seed.ts`. This backend is intentionally minimal and
 * documented so the intelligence engine (Codex) can own and extend it.
 */
const DB_PATH = fileURLToPath(new URL('../data/codeproof.db', import.meta.url));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
