import type { AnalysisResult } from "@/types/analysis";

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, AnalysisResult>();

export function getCachedAnalysis(key: string): AnalysisResult | undefined {
  const value = cache.get(key);
  if (!value) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return structuredClone(value);
}

export function setCachedAnalysis(key: string, value: AnalysisResult): void {
  cache.delete(key);
  cache.set(key, structuredClone(value));
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function clearAnalysisCache(): void {
  cache.clear();
}
