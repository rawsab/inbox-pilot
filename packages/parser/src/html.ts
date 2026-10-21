import { convert } from "html-to-text";

/**
 * Convert HTML to inert plain text without loading remote resources.
 * Scripts/styles are stripped by the converter; we never fetch URLs.
 */
export function htmlToInertText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "iframe", format: "skip" },
    ],
  });
}
