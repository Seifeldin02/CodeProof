/** Small display formatters shared across the analytics UI. */

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDays(days: number | null): string {
  if (days === null) return '—';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatPercent(pct: number | null, digits = 0): string {
  if (pct === null) return '—';
  return `${pct.toFixed(digits)}%`;
}
