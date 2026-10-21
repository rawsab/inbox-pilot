import { simpleParser } from "mailparser";
import { htmlToInertText } from "./html.js";
import { normalizePlainText, type NormalizedMessage } from "./normalize.js";

const MAX_DECODED_BYTES = 1_000_000;

export type ParsedMime = {
  subject: string;
  fromEmail?: string;
  fromName?: string;
  text?: string;
  html?: string;
  decodedBytes: number;
  truncated: boolean;
  flags: string[];
};

/**
 * Decode MIME safely. Prefer text/plain; otherwise convert HTML to inert text.
 * Does not fetch images, styles, scripts, or URLs.
 */
export async function decodeMime(raw: Buffer): Promise<ParsedMime> {
  const flags: string[] = [];
  let buf = raw;
  let truncated = false;
  if (buf.byteLength > MAX_DECODED_BYTES) {
    buf = buf.subarray(0, MAX_DECODED_BYTES);
    truncated = true;
    flags.push("size_cap");
  }

  try {
    const parsed = await simpleParser(buf);
    const from = parsed.from?.value?.[0];
    return {
      subject: parsed.subject ?? "",
      fromEmail: from?.address,
      fromName: from?.name,
      text: parsed.text || undefined,
      html: typeof parsed.html === "string" ? parsed.html : undefined,
      decodedBytes: buf.byteLength,
      truncated,
      flags,
    };
  } catch {
    flags.push("malformed_mime");
    return {
      subject: "",
      text: buf.toString("utf8"),
      decodedBytes: buf.byteLength,
      truncated,
      flags,
    };
  }
}

export async function normalizeFromMime(
  raw: Buffer,
  quotedOverride?: string,
): Promise<{
  mime: ParsedMime;
  normalized: NormalizedMessage;
}> {
  const mime = await decodeMime(raw);
  let body = "";
  if (mime.text?.trim()) {
    body = mime.text;
  } else if (mime.html) {
    body = htmlToInertText(mime.html);
    mime.flags.push("html_to_text");
  } else {
    body = "";
    mime.flags.push("empty_body");
  }

  const normalized = normalizePlainText({
    subject: mime.subject,
    body,
    quoted: quotedOverride,
  });
  if (mime.truncated) {
    normalized.truncated = true;
    normalized.truncationForcedReview = true;
    normalized.flags.push(...mime.flags);
  } else {
    normalized.flags.push(...mime.flags);
  }
  return { mime, normalized };
}
