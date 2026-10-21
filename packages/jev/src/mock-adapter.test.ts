import {
  PrimaryCategory,
  SCHEMA_VERSION,
} from "@inbox-pilot/contracts";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MockJevAdapter } from "./mock-adapter.js";

describe("MockJevAdapter", () => {
  it("rejects invented candidate ids in scripts by filtering", async () => {
    const adapter = new MockJevAdapter([
      {
        match: "offer",
        primary_category: PrimaryCategory.OFFER,
        candidate_verdicts: [
          { candidate_id: "company_1", verdict: "SUPPORTED" },
          { candidate_id: "hallucinated", verdict: "SUPPORTED" },
        ],
      },
    ]);

    const out = await adapter.classifyAndVerify({
      request_id: randomUUID(),
      account_id: randomUUID(),
      normalized_content_hash: "abc",
      schema_version: SCHEMA_VERSION,
      newest_message_text: "We are pleased to offer you the role.",
      subject: "Offer",
      category_definitions: {},
      candidates: [
        {
          candidate_id: "company_1",
          field_type: "company",
          normalized_value: "Acme",
          original_value: "Acme",
          source_segment: "body",
          start: 0,
          end: 4,
          rule_id: "t",
          parser_version: "0.1.0",
          rank: 1,
        },
      ],
      truncation_forced_review: false,
    });

    expect(out.candidate_verdicts.map((v) => v.candidate_id)).toEqual(["company_1"]);
    expect(out.primary_category).toBe(PrimaryCategory.OFFER);
  });
});
