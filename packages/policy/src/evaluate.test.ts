import {
  AccountMode,
  AmbiguityFlag,
  PrimaryCategory,
  PolicyOutcome,
  ReasonCode,
  ScoreKind,
} from "@inbox-pilot/contracts";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./evaluate.js";

const account = {
  connected: true,
  paused: false,
  mode: AccountMode.DRY_RUN,
  kill_switch: false,
  policy_version_active: "0.1.0",
};

function judgment(
  category: PrimaryCategory,
  flags: AmbiguityFlag[] = [],
) {
  return {
    primary_category: category,
    evidence_spans: [],
    ambiguity_flags: flags,
    candidate_verdicts: [],
    raw_score: null,
    score_kind: ScoreKind.NONE,
  };
}

describe("evaluatePolicy", () => {
  it("always reviews interview, offer, and rejection", () => {
    for (const category of [
      PrimaryCategory.INTERVIEW,
      PrimaryCategory.OFFER,
      PrimaryCategory.REJECTION,
    ]) {
      const d = evaluatePolicy({
        judgment: judgment(category),
        account,
        calibratedScore: 0.999,
        releasedAutoClasses: new Set([PrimaryCategory.APPLICATION_CONFIRMATION]),
      });
      expect(d.outcome).toBe(PolicyOutcome.REVIEW);
      expect(d.reason_codes).toContain(ReasonCode.SENSITIVE_CATEGORY);
    }
  });

  it("ignores not_recruiting", () => {
    const d = evaluatePolicy({
      judgment: judgment(PrimaryCategory.NOT_RECRUITING),
      account,
      calibratedScore: null,
      releasedAutoClasses: new Set(),
    });
    expect(d.outcome).toBe(PolicyOutcome.IGNORE);
  });

  it("reviews when class gate has not passed", () => {
    const d = evaluatePolicy({
      judgment: judgment(PrimaryCategory.APPLICATION_CONFIRMATION),
      account,
      calibratedScore: 0.99,
      releasedAutoClasses: new Set(),
    });
    expect(d.outcome).toBe(PolicyOutcome.REVIEW);
    expect(d.reason_codes).toContain(ReasonCode.CLASS_GATE_NOT_PASSED);
  });

  it("retries on adapter failure before budget exceeded", () => {
    const d = evaluatePolicy({
      judgment: judgment(PrimaryCategory.UNKNOWN),
      account,
      calibratedScore: null,
      releasedAutoClasses: new Set(),
      adapterFailed: true,
    });
    expect(d.outcome).toBe(PolicyOutcome.RETRY);
  });
});
