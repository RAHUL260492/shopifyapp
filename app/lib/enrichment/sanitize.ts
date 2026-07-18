// Treat ALL LLM output as untrusted (brief QA-3/QA-8). Two guarantees:
//  1. sanitizeHtml() strips scripts, event handlers, and dangerous URLs before
//     any HTML is written back to the store — allowlist of safe formatting tags.
//  2. In our own review UI we never use dangerouslySetInnerHTML; LLM text is
//     rendered through Polaris <Text>, which escapes. So it renders inert there
//     regardless. This module is the defense for the write-back path.

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
]);

/** Collapse to plain text: strip every tag, decode a few common entities. */
export function stripToText(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Allowlist HTML sanitizer for the write-back path. Removes:
 *  - <script>/<style>/<iframe>… and their contents,
 *  - any tag not in ALLOWED_TAGS (tag stripped, inner text kept),
 *  - all attributes (so on*=, style=, href/src with javascript: can't survive).
 * Conservative by design: we never need attributes on a product description.
 */
export function sanitizeHtml(input: string): string {
  let html = input;

  // Drop dangerous elements together with their content.
  html = html.replace(
    /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  // Drop any orphan/self-closing dangerous open tags left behind.
  html = html.replace(
    /<\/?(script|style|iframe|object|embed|noscript|template)\b[^>]*>/gi,
    "",
  );

  // Rewrite every remaining tag: keep it only if allowlisted, and drop ALL
  // attributes (this is what neutralizes onerror=, javascript: hrefs, etc.).
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)\b[^>]*?(\/?)>/g, (_m, close, tag, selfClose) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    return `<${close}${name}${selfClose ? " /" : ""}>`;
  });

  // Any stray angle-bracket fragments (e.g. "<img src=x onerror=...") that
  // didn't form a complete tag: strip remaining tag-like leftovers.
  html = html.replace(/<[^>]*>/g, (m) => {
    // Re-check: only allowlisted simple tags survived above; anything still
    // here is malformed — remove it.
    return /^<\/?(?:p|br|strong|b|em|i|ul|ol|li|h2|h3|h4)(?: \/)?>$/.test(m)
      ? m
      : "";
  });

  return html.trim();
}
