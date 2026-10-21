import { describe, expect, it } from "vitest";
import { htmlToInertText } from "./html.js";
import { normalizeFromMime } from "./mime.js";

describe("mime + html", () => {
  it("prefers text/plain and strips script-like HTML when used", async () => {
    const raw = Buffer.from(
      [
        "From: a@b.test",
        "Subject: Hello",
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset=utf-8',
        "",
        "Thank you for your application for Designer at HtmlCo.",
      ].join("\r\n"),
      "utf8",
    );
    const { normalized } = await normalizeFromMime(raw);
    expect(normalized.plainText).toContain("HtmlCo");
  });

  it("converts HTML without href or img content", () => {
    const text = htmlToInertText(
      '<p>Hi</p><script>alert(1)</script><a href="https://evil.test">click</a><img src="https://x.test/x.png"/>',
    );
    expect(text).toContain("Hi");
    expect(text).not.toContain("alert");
    expect(text.toLowerCase()).not.toContain("https://evil");
  });
});
