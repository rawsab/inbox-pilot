import {
  AmbiguityFlag,
  CandidateVerdict,
  ClassifyAndVerifyAdapter,
  ClassifyAndVerifyInput,
  ClassifyAndVerifyOutput,
  PrimaryCategory,
  ScoreKind,
  classifyAndVerifyInputSchema,
  classifyAndVerifyOutputSchema,
  primaryCategorySchema,
} from "@inbox-pilot/contracts";

export type MockScript = {
  /** Match fixture id or content substring. */
  match: string | RegExp;
  primary_category: PrimaryCategory;
  candidate_verdicts?: ClassifyAndVerifyOutput["candidate_verdicts"];
  ambiguity_flags?: AmbiguityFlag[];
  raw_score?: number | null;
  score_kind?: ScoreKind;
  fail?: boolean;
};

/**
 * Deterministic mock adapter for fixtures and CI.
 * Scripts win over heuristics; unknown mail defaults to unknown + insufficient evidence.
 */
export class MockJevAdapter implements ClassifyAndVerifyAdapter {
  constructor(private readonly scripts: MockScript[] = []) {}

  async classifyAndVerify(input: ClassifyAndVerifyInput): Promise<ClassifyAndVerifyOutput> {
    classifyAndVerifyInputSchema.parse(input);

    const haystack = `${input.subject}\n${input.newest_message_text}`;
    for (const script of this.scripts) {
      const matched =
        typeof script.match === "string"
          ? haystack.includes(script.match)
          : script.match.test(haystack);
      if (!matched) continue;
      if (script.fail) {
        throw new Error("mock_jev_unavailable");
      }
      return this.finish(input, {
        primary_category: script.primary_category,
        ambiguity_flags: script.ambiguity_flags ?? [],
        candidate_verdicts:
          script.candidate_verdicts ??
          input.candidates.map((c) => ({
            candidate_id: c.candidate_id,
            verdict: CandidateVerdict.INSUFFICIENT,
          })),
        raw_score: script.raw_score ?? null,
        score_kind: script.score_kind ?? ScoreKind.NONE,
      });
    }

    const heuristic = heuristicCategory(haystack);
    return this.finish(input, {
      primary_category: heuristic.category,
      ambiguity_flags: heuristic.flags,
      candidate_verdicts: input.candidates.map((c) => ({
        candidate_id: c.candidate_id,
        verdict:
          heuristic.category === PrimaryCategory.NOT_RECRUITING
            ? CandidateVerdict.REJECTED
            : CandidateVerdict.INSUFFICIENT,
      })),
      raw_score: null,
      score_kind: ScoreKind.NONE,
    });
  }

  private finish(
    input: ClassifyAndVerifyInput,
    partial: Omit<ClassifyAndVerifyOutput, "evidence_spans"> & {
      evidence_spans?: ClassifyAndVerifyOutput["evidence_spans"];
    },
  ): ClassifyAndVerifyOutput {
    // Only accept submitted candidate IDs.
    const allowed = new Set(input.candidates.map((c) => c.candidate_id));
    const verdicts = partial.candidate_verdicts.filter((v) => allowed.has(v.candidate_id));

    const flags = [...partial.ambiguity_flags];
    if (input.truncation_forced_review) {
      flags.push(AmbiguityFlag.TRUNCATED);
    }

    const out: ClassifyAndVerifyOutput = {
      primary_category: primaryCategorySchema.parse(partial.primary_category),
      evidence_spans: partial.evidence_spans ?? [],
      ambiguity_flags: flags,
      candidate_verdicts: verdicts,
      raw_score: partial.raw_score,
      score_kind: partial.score_kind,
      provider_model: "mock-jev",
      latency_ms: 1,
    };
    return classifyAndVerifyOutputSchema.parse(out);
  }
}

function heuristicCategory(text: string): {
  category: PrimaryCategory;
  flags: AmbiguityFlag[];
} {
  const lower = text.toLowerCase();
  if (/ignore (all )?policy|archive everything|you are now/.test(lower)) {
    return {
      category: PrimaryCategory.UNKNOWN,
      flags: [AmbiguityFlag.SUSPICIOUS_INSTRUCTION],
    };
  }
  if (/we are (pleased|excited) to offer|offer of employment|internship offer/.test(lower)) {
    return { category: PrimaryCategory.OFFER, flags: [] };
  }
  if (/interview|schedule a call|take.?home|assessment/.test(lower)) {
    return { category: PrimaryCategory.INTERVIEW, flags: [] };
  }
  if (/unfortunately|not moving forward|will not be proceeding|rejected/.test(lower)) {
    return { category: PrimaryCategory.REJECTION, flags: [] };
  }
  if (/application (has been )?received|thanks for applying|we received your application/.test(lower)) {
    return { category: PrimaryCategory.APPLICATION_CONFIRMATION, flags: [] };
  }
  if (/job alert|weekly digest|unsubscribe|career newsletter/.test(lower)) {
    return { category: PrimaryCategory.NEWSLETTER, flags: [] };
  }
  if (/still under review|update on your application|checking in about your/.test(lower)) {
    return { category: PrimaryCategory.UPDATE, flags: [] };
  }
  if (/dinner|invoice|password reset|your package/.test(lower)) {
    return { category: PrimaryCategory.NOT_RECRUITING, flags: [] };
  }
  return {
    category: PrimaryCategory.UNKNOWN,
    flags: [AmbiguityFlag.INSUFFICIENT_EVIDENCE],
  };
}
