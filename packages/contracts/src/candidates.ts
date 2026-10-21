import { z } from "zod";

export const FieldType = {
  COMPANY: "company",
  ROLE: "role",
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export const fieldTypeSchema = z.enum([FieldType.COMPANY, FieldType.ROLE]);

export const CandidateVerdict = {
  SUPPORTED: "SUPPORTED",
  REJECTED: "REJECTED",
  INSUFFICIENT: "INSUFFICIENT",
} as const;

export type CandidateVerdict = (typeof CandidateVerdict)[keyof typeof CandidateVerdict];

export const candidateVerdictSchema = z.enum([
  CandidateVerdict.SUPPORTED,
  CandidateVerdict.REJECTED,
  CandidateVerdict.INSUFFICIENT,
]);

export const candidateSchema = z.object({
  candidate_id: z.string().min(1),
  field_type: fieldTypeSchema,
  normalized_value: z.string().min(1),
  original_value: z.string().min(1),
  source_segment: z.enum(["subject", "body", "sender", "signature"]),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  rule_id: z.string().min(1),
  parser_version: z.string().min(1),
  rank: z.number().int().min(1).max(3),
});

export type Candidate = z.infer<typeof candidateSchema>;

export const candidateVerificationSchema = z.object({
  candidate_id: z.string().min(1),
  verdict: candidateVerdictSchema,
});

export type CandidateVerification = z.infer<typeof candidateVerificationSchema>;
