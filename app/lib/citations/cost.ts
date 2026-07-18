// Pure cost + daily-cap logic for citation scans. A hard per-shop daily cap
// prevents a runaway scan from burning spend (brief QA-4: cap triggers a hard
// stop + alert). Prices are USD per 1M tokens.

export interface EnginePrice {
  inPerM: number;
  outPerM: number;
}

// Approximate list prices — refine when engines go live.
export const CITATION_PRICING: Record<string, EnginePrice> = {
  "gpt-4o": { inPerM: 2.5, outPerM: 10 },
  "gemini-2.0-flash": { inPerM: 0.1, outPerM: 0.4 },
  "mock-1": { inPerM: 0, outPerM: 0 },
};

const FALLBACK: EnginePrice = { inPerM: 2.5, outPerM: 10 };

/** Default hard daily cap per shop: $2.00. */
export const DEFAULT_DAILY_CAP_CENTS = 200;

export function callCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = CITATION_PRICING[model] ?? FALLBACK;
  const usd =
    (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
  return Math.round(usd * 100);
}

/** True if spending `nextCents` more would push the day's total over the cap. */
export function wouldExceedCap(
  spentTodayCents: number,
  nextCents: number,
  capCents: number,
): boolean {
  return spentTodayCents + nextCents > capCents;
}
