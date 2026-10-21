import { z } from "zod";
import { interviewSubtypeSchema, primaryCategorySchema } from "./categories.js";
import { candidateSchema, candidateVerificationSchema } from "./candidates.js";
import { SCHEMA_VERSION } from "./versions.js";

/**
 * Internal adapter contract. Stable regardless of Jev endpoint shape.
 * Proposed contract — not an assumed vendor endpoint.
 */
export const classifyAndVerifyInputSchema = z.object({
  request_id: z.string().uuid(),
  account_id: z.string().uuid(),
  normalized_content_hash: z.string().min(1),
  schema_version: z.literal(SCHEMA_VERSION),
  newest_message_text: z.string().max(12_000),
  quoted_context: z.string().max(12_000).optional(),
  subject: z.string().max(998),
  sender: z
    .object({
      display_name: z.string().max(256).optional(),
      email: z.string().email().optional(),
      domain: z.string().max(253).optional(),
    })
    .optional(),
  category_definitions: z.record(z.string()),
  candidates: z.array(candidateSchema).max(6),
  truncation_forced_review: z.boolean().default(false),
});

export type ClassifyAndVerifyInput = z.infer<typeof classifyAndVerifyInputSchema>;

export const ScoreKind = {
  NOUL_PROBABILITY: "noul_probability",
  CHOICE_PROBABILITY: "choice_probability",
  CHOICE_CONFIDENCE: "choice_confidence",
  BINARY_VERDICT: "binary_verdict",
  NONE: "none",
} as const;

export type ScoreKind = (typeof ScoreKind)[keyof typeof ScoreKind];

export const scoreKindSchema = z.nativeEnum(ScoreKind);

export const AmbiguityFlag = {
  CONFLICTING_CATEGORIES: "conflicting_categories",
  MULTIPLE_EMPLOYERS: "multiple_employers",
  MULTIPLE_ROLES: "multiple_roles",
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
  SUSPICIOUS_INSTRUCTION: "suspicious_instruction",
  TRUNCATED: "truncated",
  UNSUPPORTED_LANGUAGE: "unsupported_language",
} as const;

export type AmbiguityFlag = (typeof AmbiguityFlag)[keyof typeof AmbiguityFlag];

export const ambiguityFlagSchema = z.nativeEnum(AmbiguityFlag);

export const evidenceSpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  excerpt: z.string().max(500),
  source: z.enum(["parser", "adapter"]).default("parser"),
});

export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;

export const classifyAndVerifyOutputSchema = z.object({
  primary_category: primaryCategorySchema,
  subtype: interviewSubtypeSchema.optional(),
  evidence_spans: z.array(evidenceSpanSchema).max(10),
  ambiguity_flags: z.array(ambiguityFlagSchema).default([]),
  candidate_verdicts: z.array(candidateVerificationSchema),
  /** Present only when the provider actually returns a ranking signal. */
  raw_score: z.number().min(0).max(1).nullable(),
  score_kind: scoreKindSchema,
  provider_model: z.string().optional(),
  latency_ms: z.number().int().nonnegative().optional(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      estimated_cost_usd: z.number().nonnegative().optional(),
    })
    .optional(),
});

export type ClassifyAndVerifyOutput = z.infer<typeof classifyAndVerifyOutputSchema>;

export interface ClassifyAndVerifyAdapter {
  classifyAndVerify(input: ClassifyAndVerifyInput): Promise<ClassifyAndVerifyOutput>;
}
