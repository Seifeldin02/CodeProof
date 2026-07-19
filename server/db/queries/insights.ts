import { db } from '../database';
import type { PersistedInsight } from '../../../src/lib/apiTypes';

interface InsightRow {
  id: string;
  tone: string;
  category: string;
  text: string;
  created_at: string;
}

export function getInsights(): PersistedInsight[] {
  const rows = db.prepare('SELECT * FROM insights ORDER BY category ASC').all() as unknown as InsightRow[];
  return rows.map((r) => ({
    id: r.id,
    tone: r.tone as PersistedInsight['tone'],
    category: r.category,
    text: r.text,
    createdAt: r.created_at,
  }));
}
