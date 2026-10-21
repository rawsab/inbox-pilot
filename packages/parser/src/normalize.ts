import { createHash } from "node:crypto";
import { PARSER_VERSION } from "@inbox-pilot/contracts";

const MAX_DECODED_BYTES = 1_000_000;
const MAX_JEV_CHARS = 12_000;

export type NormalizedMessage = {
  plainText: string;
  quotedContext: string;
  subject: string;
  normalizedHash: string;
  parserVersion: string;
  truncated: boolean;
  truncationForcedReview: boolean;
  decodedBytes: number;
  flags: string[];
};

/**
 * Stage 1 stub: normalize already-plain fixture text.
 * Full MIME / HTML conversion arrives in Stage 2.
 */
export function normalizePlainText(input: {
  subject: string;
  body: string;
  quoted?: string;
}): NormalizedMessage {
  const flags: string[] = [];
  const decodedBytes = Buffer.byteLength(input.body, "utf8");
  let body = input.body;
  let truncated = false;
  let truncationForcedReview = false;

  if (decodedBytes > MAX_DECODED_BYTES) {
    body = body.slice(0, MAX_DECODED_BYTES);
    truncated = true;
    truncationForcedReview = true;
    flags.push("size_cap");
  }

  // Split crude quoted reply markers for fixtures.
  // When caller supplies quoted context separately, `body` is newest-only.
  let newest = body;
  let quoted = input.quoted ?? "";
  if (!input.quoted) {
    const quoteIdx = body.search(/\nOn .+ wrote:\n|\n>{1,}/);
    if (quoteIdx > 0) {
      newest = body.slice(0, quoteIdx).trimEnd();
      quoted = body.slice(quoteIdx).trim();
      flags.push("quote_split");
    }
  } else {
    flags.push("quoted_provided");
  }

  if (newest.length > MAX_JEV_CHARS) {
    newest = newest.slice(0, MAX_JEV_CHARS);
    truncated = true;
    truncationForcedReview = true;
    flags.push("jev_char_cap");
  }

  const normalized = newest.replace(/\s+/g, " ").trim();
  const hash = createHash("sha256")
    .update(input.subject)
    .update("\0")
    .update(normalized)
    .digest("hex");

  return {
    plainText: normalized,
    quotedContext: quoted.replace(/\s+/g, " ").trim().slice(0, MAX_JEV_CHARS),
    subject: input.subject.trim(),
    normalizedHash: hash,
    parserVersion: PARSER_VERSION,
    truncated,
    truncationForcedReview,
    decodedBytes,
    flags,
  };
}
