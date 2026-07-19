/**
 * Shared color tokens for SVG/inline chart marks so hand-built
 * visualizations stay consistent with the Tailwind theme.
 * Keep these in sync with `tailwind.config.js`.
 */
export const chart = {
  accent: '#2563eb', // brand-600
  accentSoft: '#dbe7fe', // brand-100
  positive: '#0f9d6f',
  positiveSoft: '#d1fae5',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  negative: '#e11d48',
  negativeSoft: '#ffe4e6',
  ink: '#0f172a', // slate-900
  muted: '#64748b', // slate-500
  subtle: '#94a3b8', // slate-400
  border: '#e2e8f0', // slate-200
  track: '#f1f5f9', // slate-100
  grid: '#eef2f6',
} as const;

/**
 * Curated categorical palette for source channels — harmonious and
 * restrained (no rainbow), aligned with the premium visual identity.
 */
export const categorical = [
  '#2563eb', // blue
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#d97706', // amber
  '#0f766e', // teal
  '#64748b', // slate
] as const;
