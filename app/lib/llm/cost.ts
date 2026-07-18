// Pure cost accounting for LLM calls. Prices are USD per 1M tokens.
// Kept pure + tested so the LlmUsage cost column is trustworthy for margin work.

export interface ModelPrice {
  inPerM: number;
  outPerM: number;
}

// Source: Anthropic pricing (Opus 4.8 = $5 in / $25 out per 1M tokens).
export const PRICING: Record<string, ModelPrice> = {
  "claude-opus-4-8": { inPerM: 5, outPerM: 25 },
};

const FALLBACK_PRICE: ModelPrice = { inPerM: 5, outPerM: 25 };

/** Exact USD cost of a call (may be a fraction of a cent). */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model] ?? FALLBACK_PRICE;
  return (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
}

/**
 * Cost in whole cents for the LlmUsage.costCents column, rounded to nearest
 * cent. Cheap sub-cent calls round to 0 — acceptable for v1 logging; the
 * per-shop cost audit (Phase 9) can sum costUsd() for finer granularity.
 */
export function costCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  return Math.round(costUsd(model, inputTokens, outputTokens) * 100);
}
