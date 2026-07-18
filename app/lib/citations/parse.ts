// Pure citation-response parser. Given an AI answer and the shop's brand terms +
// competitors, detect brand/product/competitor mentions and cited domains.
// Deterministic and heavily fixture-tested (QA-4). Key correctness rules:
//  - word-boundary matching so a brand that is a substring of another word does
//    NOT false-positive (e.g. "Cited" must not match inside "excited"),
//  - possessive/plural tolerance ("Acme's", "Acmes"),
//  - light fuzzy matching (edit distance ≤ 1) for misspellings, surfaced as
//    ambiguous so it can be reviewed rather than trusted blindly.

export interface Competitor {
  name: string;
  domain: string;
}

export interface CitationParseInput {
  response: string;
  /** Brand names/aliases to treat as "the merchant" (brand + product names). */
  brandTerms: string[];
  competitors: Competitor[];
}

export interface CitationParseResult {
  brandMentioned: boolean;
  productsMentioned: string[];
  competitorsMentioned: string[];
  citedDomains: string[];
  /** Terms matched only fuzzily (possible misspellings) — for review. */
  ambiguous: string[];
  /** True if the answer is empty or a refusal (no signal). */
  empty: boolean;
}

/** Strip markdown emphasis/links so matching sees plain words. */
export function normalizeText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ") // code fences
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/[*_#>~]/g, " ") // emphasis/heading marks
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Exact whole-word match, tolerating a trailing possessive/plural. */
export function matchesExact(normText: string, term: string): boolean {
  const t = term.trim();
  if (t === "") return false;
  const re = new RegExp(
    `(?<![\\w])${escapeRegExp(t)}(?:['’]s|s)?(?![\\w])`,
    "i",
  );
  return re.test(normText);
}

/** Levenshtein edit distance (pure). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Fuzzy single-token match: true if any word in the text is within edit
 * distance 1 of the term. Only applied to single-word terms of length ≥ 4 to
 * avoid noise on short/common words.
 */
export function matchesFuzzy(normText: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t.length < 4 || /\s/.test(t)) return false;
  const tokens = normText.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens.some((tok) => tok !== t && editDistance(tok, t) <= 1);
}

/** Extract unique cited domains (from URLs and bare domains), www-stripped. */
export function extractDomains(text: string): string[] {
  const found = new Set<string>();
  const tld =
    "(?:com|net|org|io|co|ai|in|us|uk|ca|de|store|shop|app|dev|info|biz)";

  // Full URLs.
  const urlRe = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/?#][^\s)]*)?/gi;
  for (const m of text.matchAll(urlRe)) {
    found.add(m[1].toLowerCase().replace(/^www\./, ""));
  }
  // Bare domains (avoid matching inside emails via a preceding-@ guard).
  const bareRe = new RegExp(`(?<![@\\w])([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.${tld})\\b`, "gi");
  for (const m of text.matchAll(bareRe)) {
    found.add(m[1].toLowerCase().replace(/^www\./, ""));
  }
  return [...found];
}

const REFUSAL_HINTS = [
  "i can't",
  "i cannot",
  "i'm unable",
  "i am unable",
  "cannot help with",
  "i don't have",
];

export function parseCitationResponse(
  input: CitationParseInput,
): CitationParseResult {
  const raw = input.response ?? "";
  const norm = normalizeText(raw);
  const lower = norm.toLowerCase();

  const empty =
    norm.length === 0 || REFUSAL_HINTS.some((h) => lower.startsWith(h));

  if (empty) {
    return {
      brandMentioned: false,
      productsMentioned: [],
      competitorsMentioned: [],
      citedDomains: extractDomains(raw),
      ambiguous: [],
      empty: true,
    };
  }

  const ambiguous: string[] = [];

  const productsMentioned: string[] = [];
  let brandMentioned = false;
  for (const term of input.brandTerms) {
    if (matchesExact(norm, term)) {
      brandMentioned = true;
      productsMentioned.push(term);
    } else if (matchesFuzzy(norm, term)) {
      brandMentioned = true;
      ambiguous.push(term);
    }
  }

  const competitorsMentioned: string[] = [];
  for (const c of input.competitors) {
    if (matchesExact(norm, c.name)) {
      competitorsMentioned.push(c.name);
    } else if (matchesFuzzy(norm, c.name)) {
      ambiguous.push(c.name);
    }
  }

  return {
    brandMentioned,
    productsMentioned: [...new Set(productsMentioned)],
    competitorsMentioned: [...new Set(competitorsMentioned)],
    citedDomains: extractDomains(raw),
    ambiguous: [...new Set(ambiguous)],
    empty: false,
  };
}
