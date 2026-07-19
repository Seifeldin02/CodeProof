import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { logger } from "@/services/observability/logger";
import type { AnalysisResult } from "@/types/analysis";

const MAX_CACHE_ENTRIES = 50;
const CACHE_KEY = /^[a-f0-9]{64}$/;

interface CacheRecord {
  analysisVersion: string;
  createdAt: string;
  result: AnalysisResult;
}

export interface AnalysisCacheStore {
  readonly storage: "postgres" | "filesystem" | "memory";
  get(key: string, analysisVersion: string): Promise<AnalysisResult | undefined>;
  set(key: string, analysisVersion: string, value: AnalysisResult): Promise<void>;
}

export class MemoryAnalysisCache implements AnalysisCacheStore {
  readonly storage = "memory" as const;
  private readonly values = new Map<string, CacheRecord>();

  async get(key: string, analysisVersion: string): Promise<AnalysisResult | undefined> {
    const record = this.values.get(key);
    if (!record || record.analysisVersion !== analysisVersion) return undefined;
    return structuredClone(record.result);
  }

  async set(key: string, analysisVersion: string, value: AnalysisResult): Promise<void> {
    this.values.set(key, { analysisVersion, createdAt: new Date().toISOString(), result: structuredClone(value) });
  }

  clear(): void {
    this.values.clear();
  }
}

export class FileAnalysisCache implements AnalysisCacheStore {
  readonly storage = "filesystem" as const;
  private readonly memory = new MemoryAnalysisCache();

  constructor(private readonly directory = process.env.CODEPROOF_CACHE_DIR ?? path.join(process.cwd(), ".data", "analysis-cache")) {}

  private filePath(key: string): string {
    if (!CACHE_KEY.test(key)) throw new Error("Invalid analysis cache key.");
    return path.join(this.directory, `${key}.json`);
  }

  async get(key: string, analysisVersion: string): Promise<AnalysisResult | undefined> {
    const inMemory = await this.memory.get(key, analysisVersion);
    if (inMemory) return inMemory;
    try {
      const raw = await readFile(this.filePath(key), "utf8");
      const record = JSON.parse(raw) as CacheRecord;
      if (record.analysisVersion !== analysisVersion || record.result.metadata.engineVersion !== analysisVersion) return undefined;
      await this.memory.set(key, analysisVersion, record.result);
      return structuredClone(record.result);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn("cache_read_failed", { storage: this.storage, errorType: error instanceof Error ? error.name : "unknown" });
      }
      return undefined;
    }
  }

  async set(key: string, analysisVersion: string, value: AnalysisResult): Promise<void> {
    await this.memory.set(key, analysisVersion, value);
    await mkdir(this.directory, { recursive: true });
    const target = this.filePath(key);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const record: CacheRecord = { analysisVersion, createdAt: new Date().toISOString(), result: value };
    try {
      await writeFile(temporary, JSON.stringify(record), { encoding: "utf8", flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      const targetExists = await stat(target).then(() => true).catch(() => false);
      if (!targetExists) throw error;
    }
    await this.prune();
  }

  private async prune(): Promise<void> {
    const entries = (await readdir(this.directory)).filter((name) => CACHE_KEY.test(name.replace(/\.json$/, "")));
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    const dated = await Promise.all(entries.map(async (name) => ({
      name,
      modified: (await stat(path.join(this.directory, name))).mtimeMs,
    })));
    const expired = dated.sort((a, b) => a.modified - b.modified).slice(0, dated.length - MAX_CACHE_ENTRIES);
    await Promise.all(expired.map((entry) => unlink(path.join(this.directory, entry.name)).catch(() => undefined)));
  }
}

export class PostgresAnalysisCache implements AnalysisCacheStore {
  readonly storage = "postgres" as const;
  private initialized: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private initialize(): Promise<void> {
    this.initialized ??= this.pool.query(`
      CREATE TABLE IF NOT EXISTS codeproof_analysis_cache (
        cache_key TEXT PRIMARY KEY,
        analysis_version TEXT NOT NULL,
        result JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => undefined);
    return this.initialized;
  }

  async get(key: string, analysisVersion: string): Promise<AnalysisResult | undefined> {
    if (!CACHE_KEY.test(key)) throw new Error("Invalid analysis cache key.");
    await this.initialize();
    const query = await this.pool.query<{ result: AnalysisResult }>(
      "SELECT result FROM codeproof_analysis_cache WHERE cache_key = $1 AND analysis_version = $2",
      [key, analysisVersion],
    );
    const result = query.rows[0]?.result;
    return result?.metadata.engineVersion === analysisVersion ? structuredClone(result) : undefined;
  }

  async set(key: string, analysisVersion: string, value: AnalysisResult): Promise<void> {
    if (!CACHE_KEY.test(key)) throw new Error("Invalid analysis cache key.");
    await this.initialize();
    await this.pool.query(
      `INSERT INTO codeproof_analysis_cache (cache_key, analysis_version, result)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (cache_key) DO UPDATE SET analysis_version = EXCLUDED.analysis_version, result = EXCLUDED.result, created_at = NOW()`,
      [key, analysisVersion, JSON.stringify(value)],
    );
  }
}

let defaultStore: AnalysisCacheStore | null = null;

export function getDefaultCacheStore(): AnalysisCacheStore {
  if (defaultStore) return defaultStore;
  if (process.env.DATABASE_URL) {
    defaultStore = new PostgresAnalysisCache(new Pool({ connectionString: process.env.DATABASE_URL, max: 3 }));
  } else {
    defaultStore = new FileAnalysisCache();
  }
  return defaultStore;
}
