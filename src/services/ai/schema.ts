import { z } from "zod";

const aiSource = z.literal("AI Interpretation");
const candidateSource = z.literal("Candidate Claim");
const jobSource = z.literal("Job Requirement");
const aiOrigin = z.literal("ai_interpretation");
const evidenceLevel = z.enum([
  "Strong Evidence",
  "Good Evidence",
  "Partial Evidence",
  "Limited Evidence",
  "Insufficient Evidence",
]);

const architectureSchema = z.object({
  purpose: z.string().min(1).max(1_000),
  overview: z.string().min(1).max(3_000),
  majorModules: z.array(z.string().min(1).max(300)).max(20),
  boundaries: z.array(z.string().min(1).max(500)).max(20),
  dataFlow: z.array(z.string().min(1).max(700)).max(20),
  engineeringDecisions: z.array(z.string().min(1).max(700)).max(20),
  importantFiles: z.array(z.string().min(1).max(500)).max(20),
  origin: aiOrigin,
  source: aiSource,
}).strict();

const evidenceItemSchema = z.object({
  file: z.string().min(1).max(500),
  summary: z.string().min(1).max(700),
  implementationExample: z.string().min(1).max(1_000),
  origin: aiOrigin,
  source: aiSource,
}).strict();

const skillSchema = z.object({
  skill: z.string().min(1).max(120),
  level: evidenceLevel,
  explanation: z.string().min(1).max(1_500),
  evidence: z.array(evidenceItemSchema).min(1).max(8),
  origin: aiOrigin,
  source: aiSource,
}).strict();

const gapSchema = z.object({
  area: z.string().min(1).max(120),
  explanation: z.string().min(1).max(1_000),
  checkedFiles: z.array(z.string().min(1).max(500)).max(12),
  origin: aiOrigin,
  source: aiSource,
}).strict();

const interviewQuestionSchema = z.object({
  question: z.string().min(1).max(1_000),
  relatedSkill: z.string().min(1).max(120),
  difficulty: z.enum(["Foundational", "Intermediate", "Advanced"]),
  files: z.array(z.string().min(1).max(500)).min(1).max(6),
  relevance: z.string().min(1).max(1_000),
  origin: aiOrigin,
  source: aiSource,
}).strict();

export const aiAnalysisSchema = z.object({
  architecture: architectureSchema,
  skills: z.array(skillSchema).max(24),
  gaps: z.array(gapSchema).max(16),
  interviewQuestions: z.array(interviewQuestionSchema).max(12),
}).strict();

export const resumeExtractionSchema = z.object({
  claims: z.array(z.object({
    claim: z.string().min(1).max(500),
    category: z.enum([
      "technology",
      "framework",
      "language",
      "cloud_platform",
      "database",
      "role",
      "experience",
      "project",
      "engineering",
    ]),
    source: candidateSource,
  }).strict()).max(40),
}).strict();

export const jobExtractionSchema = z.object({
  requirements: z.array(z.object({
    requirement: z.string().min(1).max(500),
    importance: z.enum(["required", "preferred", "context"]),
    category: z.enum(["skill", "responsibility", "seniority", "experience", "domain"]),
    source: jobSource,
  }).strict()).max(40),
}).strict();
