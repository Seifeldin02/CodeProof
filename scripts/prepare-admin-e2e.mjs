import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = process.env.CODEPROOF_ADMIN_E2E_DB_PATH;
const email = process.env.CODEPROOF_ADMIN_E2E_EMAIL;
const password = process.env.CODEPROOF_ADMIN_E2E_PASSWORD;
if (!databasePath || !path.isAbsolute(databasePath) || !email || !password || password.length < 12) {
  throw new Error("Set an absolute test database path and synthetic admin credentials.");
}
mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
try {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
  const salt = randomBytes(16).toString("hex");
  const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run("admin-e2e-owner", email.trim().toLowerCase(), hash, new Date().toISOString());
} finally {
  db.close();
}
