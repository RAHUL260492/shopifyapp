// Public API of the readiness engine: score one product, or roll up a store.

import { RULES } from "./rules";
import type { ScorableProduct, ScoreBreakdown, ReadinessIssue } from "./types";

export * from "./types";
export { RULES, htmlToText, wordCount } from "./rules";

/**
 * Score a single product 0..100. Deterministic. Because rule weights sum to
 * 100, the score is the weighted sum of each rule's ratio, rounded to an int.
 */
export function scoreProduct(product: ScorableProduct): ScoreBreakdown {
  const rules = RULES.map((rule) => rule(product));
  const weighted = rules.reduce((sum, r) => sum + r.ratio * r.weight, 0);
  const score = Math.round(weighted);
  const issues: ReadinessIssue[] = rules.flatMap((r) => r.issues);
  return { score, rules, issues };
}

/**
 * Store-level readiness score: the mean of per-product scores, rounded.
 * Empty catalog scores 0.
 */
export function scoreStore(products: ScorableProduct[]): number {
  if (products.length === 0) return 0;
  const total = products.reduce((sum, p) => sum + scoreProduct(p).score, 0);
  return Math.round(total / products.length);
}
