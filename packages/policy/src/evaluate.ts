import {
  AccountMode,
  AccountStateForPolicy,
  AppLabelKey,
  AUTO_ELIGIBLE_CATEGORIES,
  CALIBRATION_VERSION,
  CandidateVerdict,
  ClassifyAndVerifyOutput,
  EntityVerdict,
  FieldType,
  POLICY_VERSION,
  PolicyDecision,
  PolicyOutcome,
  PrimaryCategory,
  ReasonCode,
  SENSITIVE_CATEGORIES,
} from "@inbox-pilot/contracts";

export type PolicyInput = {
  judgment: ClassifyAndVerifyOutput;
  account: AccountStateForPolicy;
  /** Calibrated p_correct when available; Stage 1 leaves this null. */
  calibratedScore: number | null;
  /** Classes that have passed the held-out precision gate. Empty in Stage 1. */
  releasedAutoClasses: ReadonlySet<PrimaryCategory>;
  truncationForcedReview?: boolean;
  adapterFailed?: boolean;
  retryBudgetExceeded?: boolean;
};

const CATEGORY_TO_LABEL: Partial<Record<PrimaryCategory, AppLabelKey>> = {
  [PrimaryCategory.APPLICATION_CONFIRMATION]: AppLabelKey.APPLICATION,
  [PrimaryCategory.REJECTION]: AppLabelKey.REJECTION,
  [PrimaryCategory.INTERVIEW]: AppLabelKey.INTERVIEW,
  [PrimaryCategory.OFFER]: AppLabelKey.OFFER,
  [PrimaryCategory.UPDATE]: AppLabelKey.UPDATE,
  [PrimaryCategory.NEWSLETTER]: AppLabelKey.NEWSLETTER,
};

const AUTO_THRESHOLDS: Partial<Record<PrimaryCategory, number>> = {
  [PrimaryCategory.APPLICATION_CONFIRMATION]: 0.98,
  [PrimaryCategory.NEWSLETTER]: 0.98,
  [PrimaryCategory.UPDATE]: 0.99,
};

function buildEntityVerdicts(judgment: ClassifyAndVerifyOutput): EntityVerdict[] {
  const byType = new Map<string, EntityVerdict>();

  for (const field of [FieldType.COMPANY, FieldType.ROLE] as const) {
    byType.set(field, {
      field_type: field,
      candidate_id: null,
      value: null,
      verdict: null,
      accepted: false,
    });
  }

  // Candidate values are not on the judgment; Stage 1 marks accepted only when SUPPORTED.
  // Full span + precision gate lands with the parser in Stage 2/3.
  for (const v of judgment.candidate_verdicts) {
    if (v.verdict !== CandidateVerdict.SUPPORTED) continue;
    // Without field_type on the verdict alone we cannot accept; leave accepted false.
    // Parser-linked acceptance is applied by the worker when candidate records are joined.
    void v;
  }

  return [...byType.values()];
}

/**
 * Pure deterministic policy. Hard safety gates run before score thresholds.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const reasons: ReasonCode[] = [];
  const entityVerdicts = buildEntityVerdicts(input.judgment);
  const category = input.judgment.primary_category;

  const base = {
    category,
    calibrated_score: input.calibratedScore,
    calibration_version: CALIBRATION_VERSION,
    policy_version: POLICY_VERSION,
    entity_verdicts: entityVerdicts,
  };

  // Hard account gates: no Gmail write intent when unsafe, but still classify outcome.
  if (!input.account.connected) {
    reasons.push(ReasonCode.ACCOUNT_DISCONNECTED);
  }
  if (input.account.paused) {
    reasons.push(ReasonCode.ACCOUNT_PAUSED);
  }
  if (input.account.kill_switch) {
    reasons.push(ReasonCode.GLOBAL_KILL_SWITCH);
  }
  if (input.account.policy_version_active !== POLICY_VERSION) {
    reasons.push(ReasonCode.POLICY_STALE);
  }
  if (input.account.mode === AccountMode.DRY_RUN) {
    reasons.push(ReasonCode.DRY_RUN);
  }

  if (input.adapterFailed) {
    reasons.push(ReasonCode.JEV_UNAVAILABLE);
    if (input.retryBudgetExceeded) {
      reasons.push(ReasonCode.RETRY_BUDGET_EXCEEDED);
      return {
        ...base,
        outcome: PolicyOutcome.REVIEW,
        reason_codes: reasons.length ? reasons : [ReasonCode.JEV_UNAVAILABLE],
        proposed_label_key: AppLabelKey.REVIEW,
      };
    }
    return {
      ...base,
      outcome: PolicyOutcome.RETRY,
      reason_codes: reasons.length ? reasons : [ReasonCode.JEV_UNAVAILABLE],
      proposed_label_key: null,
    };
  }

  if (input.truncationForcedReview || input.judgment.ambiguity_flags.includes("truncated")) {
    reasons.push(ReasonCode.CONTENT_TRUNCATED);
    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  if (input.judgment.ambiguity_flags.includes("suspicious_instruction")) {
    reasons.push(ReasonCode.SUSPICIOUS_INSTRUCTION);
    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  if (input.judgment.ambiguity_flags.includes("conflicting_categories")) {
    reasons.push(ReasonCode.CONFLICTING_CATEGORIES);
    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  if (input.judgment.ambiguity_flags.includes("insufficient_evidence")) {
    reasons.push(ReasonCode.INSUFFICIENT_EVIDENCE);
    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  if (category === PrimaryCategory.NOT_RECRUITING) {
    reasons.push(ReasonCode.NOT_RECRUITING);
    return {
      ...base,
      outcome: PolicyOutcome.IGNORE,
      reason_codes: reasons,
      proposed_label_key: null,
    };
  }

  if (category === PrimaryCategory.UNKNOWN) {
    reasons.push(ReasonCode.UNKNOWN_CATEGORY);
    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  if (SENSITIVE_CATEGORIES.has(category)) {
    reasons.push(ReasonCode.SENSITIVE_CATEGORY, ReasonCode.HUMAN_APPROVAL_REQUIRED);
    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  // Routine categories: Stage 1 has no released auto classes and no calibration → review or dry-run propose.
  if (AUTO_ELIGIBLE_CATEGORIES.has(category)) {
    const threshold = AUTO_THRESHOLDS[category] ?? 0.98;
    const released = input.releasedAutoClasses.has(category);
    const scoreOk =
      input.calibratedScore !== null && input.calibratedScore >= threshold;

    if (!released) {
      reasons.push(ReasonCode.CLASS_GATE_NOT_PASSED);
    }
    if (input.calibratedScore === null) {
      reasons.push(ReasonCode.SCORE_NULL);
    } else if (!scoreOk) {
      reasons.push(ReasonCode.SCORE_BELOW_THRESHOLD);
    }

    if (released && scoreOk) {
      reasons.push(ReasonCode.ROUTINE_AUTO_ELIGIBLE);
      // Safety gates still block writes; outcome records intent.
      const blockedWrite =
        !input.account.connected ||
        input.account.paused ||
        input.account.kill_switch ||
        input.account.policy_version_active !== POLICY_VERSION ||
        input.account.mode === AccountMode.DRY_RUN;

      if (blockedWrite) {
        return {
          ...base,
          outcome: PolicyOutcome.REVIEW,
          reason_codes: reasons,
          proposed_label_key: CATEGORY_TO_LABEL[category] ?? AppLabelKey.REVIEW,
        };
      }

      return {
        ...base,
        outcome: PolicyOutcome.ADD_LABEL,
        reason_codes: reasons,
        proposed_label_key: CATEGORY_TO_LABEL[category] ?? null,
      };
    }

    return {
      ...base,
      outcome: PolicyOutcome.REVIEW,
      reason_codes: reasons,
      proposed_label_key: AppLabelKey.REVIEW,
    };
  }

  reasons.push(ReasonCode.HUMAN_APPROVAL_REQUIRED);
  return {
    ...base,
    outcome: PolicyOutcome.REVIEW,
    reason_codes: reasons,
    proposed_label_key: AppLabelKey.REVIEW,
  };
}
