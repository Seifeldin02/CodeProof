/**
 * DEMO / MOCK DATA — NOT REAL CANDIDATES OR PRODUCTION ANALYSIS.
 * ---------------------------------------------------------------------------
 * Deterministically generates a realistic sample hiring pipeline so the
 * Hiring Insights dashboard can be demonstrated without a live database.
 *
 * This module is intentionally isolated under `mock/`. It must never be
 * imported by production data paths or mixed with real candidate records or
 * live CodeProof repository analysis. The generator is seeded, so the demo
 * numbers are stable across reloads.
 *
 * The model bakes in real, explainable signals (higher verified-skill scores
 * and stronger sources advance further) so every chart tells a coherent story.
 */
import {
  type CandidateOutcome,
  type CandidateRecord,
  type PipelineStage,
  PIPELINE_STAGES,
  type Role,
  ROLES,
  type SourceChannel,
  SOURCE_CHANNELS,
  type StageEvent,
} from '../types';

/** The dataset is generated as-of this date (also used for "in progress" logic). */
export const DEMO_AS_OF = '2026-07-19';

const SEED = 20260719;
const CANDIDATE_COUNT = 88;

// --- deterministic PRNG (mulberry32) so the demo is reproducible ------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const randInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
/** Bell-ish value in [0,1] (mean 0.5) via averaging uniforms. */
const bell = (rng: () => number) => (rng() + rng() + rng()) / 3;

function weightedPick<T extends string>(
  rng: () => number,
  weights: Record<T, number>,
  keys: readonly T[],
): T {
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

// --- date helpers -----------------------------------------------------------
const toISO = (d: Date) => d.toISOString().slice(0, 10);
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
function randomDate(rng: () => number, startISO: string, endISO: string): string {
  const s = Date.parse(startISO);
  const e = Date.parse(endISO);
  return toISO(new Date(s + rng() * (e - s)));
}

// --- source & role configuration -------------------------------------------
const SOURCE_WEIGHTS: Record<SourceChannel, number> = {
  Referral: 15,
  CodeProof: 11,
  LinkedIn: 26,
  'Job Board': 30,
  'Careers Site': 18,
};
/** Baseline mean verified-skill score by source — encodes source quality. */
const SOURCE_SKILL_MEAN: Record<SourceChannel, number> = {
  Referral: 74,
  CodeProof: 80,
  LinkedIn: 64,
  'Job Board': 57,
  'Careers Site': 62,
};

const ROLE_WEIGHTS: Record<Role, number> = {
  'Frontend Engineer': 24,
  'Backend Engineer': 24,
  'Full-Stack Engineer': 26,
  'Data Engineer': 13,
  'DevOps Engineer': 13,
};

interface TransitionCfg {
  base: number;
  skillStrength: number;
  minGap: number;
  maxGap: number;
}
// One config per stage transition (applied→screening ... offer→hired).
const TRANSITIONS: TransitionCfg[] = [
  { base: 0.64, skillStrength: 0.3, minGap: 2, maxGap: 6 },
  { base: 0.58, skillStrength: 0.55, minGap: 3, maxGap: 8 },
  { base: 0.62, skillStrength: 0.95, minGap: 4, maxGap: 10 }, // code review = the evidence gate
  { base: 0.48, skillStrength: 0.85, minGap: 5, maxGap: 12 },
  { base: 0.82, skillStrength: 0.25, minGap: 2, maxGap: 7 }, // offer acceptance
];

function advanceProbability(cfg: TransitionCfg, skill: number): number {
  const skillFactor = ((skill - 62) / 45) * cfg.skillStrength * 0.5;
  return clamp(cfg.base + skillFactor, 0.05, 0.97);
}

const FIRST_NAMES = [
  'Amara', 'Liam', 'Sofia', 'Noah', 'Priya', 'Mateo', 'Chen', 'Olivia', 'Yusuf', 'Ava',
  'Diego', 'Hana', 'Ethan', 'Zara', 'Lucas', 'Ingrid', 'Omar', 'Maya', 'Ravi', 'Elena',
  'Kofi', 'Nina', 'Tom', 'Aisha', 'Ben', 'Lea', 'Sam', 'Yuki', 'Marco', 'Fatima',
  'Jonas', 'Leila', 'Pavel', 'Grace', 'Ibrahim', 'Clara', 'Andre', 'Mei', 'Victor', 'Nadia',
];
const LAST_NAMES = [
  'Okafor', 'Nguyen', 'Rossi', 'Kim', 'Patel', 'Garcia', 'Wang', 'Brown', 'Demir', 'Silva',
  'Costa', 'Suzuki', 'Novak', 'Haddad', 'Muller', 'Andersson', 'Ali', 'Johansson', 'Sharma', 'Petrova',
  'Mensah', 'Kowalski', 'Bauer', 'Khan', 'Meyer', 'Dubois', 'Park', 'Tanaka', 'Bianchi', 'Hassan',
  'Larsen', 'Farah', 'Sokolov', 'Bennett', 'Traore', 'Schmidt', 'Moreau', 'Zhang', 'Ivanov', 'Rahman',
];

function generateCandidates(): CandidateRecord[] {
  const rng = mulberry32(SEED);
  const candidates: CandidateRecord[] = [];

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const source = weightedPick(rng, SOURCE_WEIGHTS, SOURCE_CHANNELS);
    const role = weightedPick(rng, ROLE_WEIGHTS, ROLES);
    const skillMean = SOURCE_SKILL_MEAN[source];
    const verifiedSkillScore = clamp(Math.round(skillMean + (bell(rng) - 0.5) * 55), 20, 99);

    const appliedAt = randomDate(rng, '2025-12-08', '2026-06-24');
    const stageHistory: StageEvent[] = [{ stage: 'applied', enteredAt: appliedAt }];
    let currentDate = appliedAt;
    let furthestStage: PipelineStage = 'applied';

    for (let t = 0; t < TRANSITIONS.length; t++) {
      const cfg = TRANSITIONS[t];
      if (rng() >= advanceProbability(cfg, verifiedSkillScore)) break;
      const nextDate = addDays(currentDate, randInt(rng, cfg.minGap, cfg.maxGap));
      // Would enter the next stage in the future — they simply haven't yet.
      if (Date.parse(nextDate) > Date.parse(DEMO_AS_OF)) break;
      currentDate = nextDate;
      furthestStage = PIPELINE_STAGES[t + 1];
      stageHistory.push({ stage: furthestStage, enteredAt: currentDate });
    }

    let outcome: CandidateOutcome;
    if (furthestStage === 'hired') {
      outcome = 'hired';
    } else if (daysBetween(currentDate, DEMO_AS_OF) <= 18) {
      outcome = 'in_progress';
    } else {
      outcome = rng() < 0.12 ? 'withdrawn' : 'rejected';
    }

    const first = FIRST_NAMES[randInt(rng, 0, FIRST_NAMES.length - 1)];
    const last = LAST_NAMES[randInt(rng, 0, LAST_NAMES.length - 1)];

    candidates.push({
      id: `cand-${String(i + 1).padStart(3, '0')}`,
      name: `${first} ${last}`,
      role,
      source,
      verifiedSkillScore,
      appliedAt,
      outcome,
      furthestStage,
      stageHistory,
    });
  }

  return candidates;
}

/** Stable, seeded demo dataset for the Hiring Insights dashboard. */
export const mockCandidates: CandidateRecord[] = generateCandidates();
