import { z } from "zod";
import { primaryCategorySchema } from "./categories.js";
import { candidateVerdictSchema } from "./candidates.js";
import { reasonCodeSchema } from "./reason-codes.js";

export const PolicyOutcome = {
  ADD_LABEL: "ADD_LABEL",
  REVIEW: "REVIEW",
  IGNORE: "IGNORE",
  RETRY: "RETRY",
} as const;

export type PolicyOutcome = (typeof PolicyOutcome)[keyof typeof PolicyOutcome];

export const policyOutcomeSchema = z.enum([
  PolicyOutcome.ADD_LABEL,
  PolicyOutcome.REVIEW,
  PolicyOutcome.IGNORE,
  PolicyOutcome.RETRY,
]);

export const AccountMode = {
  DRY_RUN: "dry_run",
  LABELING: "labeling",
} as const;

export type AccountMode = (typeof AccountMode)[keyof typeof AccountMode];

export const accountModeSchema = z.enum([AccountMode.DRY_RUN, AccountMode.LABELING]);

export const entityVerdictSchema = z.object({
  field_type: z.enum(["company", "role"]),
  candidate_id: z.string().nullable(),
  value: z.string().nullable(),
  verdict: candidateVerdictSchema.nullable(),
  accepted: z.boolean(),
});

export type EntityVerdict = z.infer<typeof entityVerdictSchema>;

export const policyDecisionSchema = z.object({
  outcome: policyOutcomeSchema,
  category: primaryCategorySchema,
  calibrated_score: z.number().min(0).max(1).nullable(),
  calibration_version: z.string(),
  policy_version: z.string(),
  reason_codes: z.array(reasonCodeSchema).min(1),
  entity_verdicts: z.array(entityVerdictSchema),
  proposed_label_key: z
    .enum(["application", "rejection", "interview", "offer", "update", "newsletter", "review"])
    .nullable(),
});

export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export const AccountStateForPolicy = z.object({
  connected: z.boolean(),
  paused: z.boolean(),
  mode: accountModeSchema,
  kill_switch: z.boolean(),
  policy_version_active: z.string(),
});

export type AccountStateForPolicy = z.infer<typeof AccountStateForPolicy>;
