import { z } from "zod";

/** Machine-readable policy and pipeline reason codes. */
export const ReasonCode = {
  // Safety / account gates
  ACCOUNT_DISCONNECTED: "account_disconnected",
  ACCOUNT_PAUSED: "account_paused",
  GLOBAL_KILL_SWITCH: "global_kill_switch",
  DRY_RUN: "dry_run",
  POLICY_STALE: "policy_stale",

  // Model / adapter
  JEV_UNAVAILABLE: "jev_unavailable",
  JEV_INVALID_OUTPUT: "jev_invalid_output",
  JEV_TIMEOUT: "jev_timeout",
  JEV_BUDGET_EXHAUSTED: "jev_budget_exhausted",
  JEV_CIRCUIT_OPEN: "jev_circuit_open",
  JEV_SCHEMA_FAILURE: "jev_schema_failure",
  RETRY_BUDGET_EXCEEDED: "retry_budget_exceeded",

  // Evidence / content
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
  CONFLICTING_CATEGORIES: "conflicting_categories",
  UNSUPPORTED_LANGUAGE: "unsupported_language",
  CONTENT_TRUNCATED: "content_truncated",
  MALFORMED_CONTENT: "malformed_content",
  SUSPICIOUS_INSTRUCTION: "suspicious_instruction",
  AMBIGUOUS_SEGMENTATION: "ambiguous_segmentation",

  // Score / calibration
  SCORE_BELOW_THRESHOLD: "score_below_threshold",
  SCORE_NULL: "score_null",
  CALIBRATION_INSUFFICIENT: "calibration_insufficient",
  CLASS_GATE_NOT_PASSED: "class_gate_not_passed",

  // Category policy
  SENSITIVE_CATEGORY: "sensitive_category",
  NOT_RECRUITING: "not_recruiting",
  UNKNOWN_CATEGORY: "unknown_category",
  ROUTINE_AUTO_ELIGIBLE: "routine_auto_eligible",

  // Fields
  FIELD_UNSUPPORTED: "field_unsupported",
  FIELD_MISSING_SPAN: "field_missing_span",
  FIELD_PRECISION_GATE: "field_precision_gate",

  // Human / review
  HUMAN_APPROVAL_REQUIRED: "human_approval_required",
  HUMAN_CORRECTED: "human_corrected",
  HUMAN_SKIPPED: "human_skipped",
  MANUAL_OVERRIDE_LOCK: "manual_override_lock",

  // Actions
  LABEL_DELTA_FORBIDDEN: "label_delta_forbidden",
  DUPLICATE_INTENT: "duplicate_intent",
  GMAIL_RECONCILE_NEEDED: "gmail_reconcile_needed",
  STATE_CONFLICT: "state_conflict",
} as const;

export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode];

export const reasonCodeSchema = z.nativeEnum(ReasonCode);
