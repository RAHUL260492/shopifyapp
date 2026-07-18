// Pure aggregation of the N samples run per prompt per engine (brief: 3 samples
// to smooth non-determinism). A signal counts if it appears in ANY sample;
// share-of-voice math is derived from the aggregated counts.

import type { CitationParseResult } from "./parse";

export interface PromptAggregate {
  samples: number;
  /** Fraction of samples where the brand appeared (0..1). */
  brandVisibility: number;
  brandMentioned: boolean;
  competitorsMentioned: string[];
  citedDomains: string[];
  emptyCount: number;
}

export function aggregateSamples(
  results: CitationParseResult[],
): PromptAggregate {
  const samples = results.length;
  const brandHits = results.filter((r) => r.brandMentioned).length;
  const competitors = new Set<string>();
  const domains = new Set<string>();
  let emptyCount = 0;

  for (const r of results) {
    r.competitorsMentioned.forEach((c) => competitors.add(c));
    r.citedDomains.forEach((d) => domains.add(d));
    if (r.empty) emptyCount += 1;
  }

  return {
    samples,
    brandVisibility: samples === 0 ? 0 : brandHits / samples,
    brandMentioned: brandHits > 0,
    competitorsMentioned: [...competitors],
    citedDomains: [...domains],
    emptyCount,
  };
}

export interface ShareOfVoice {
  brand: number;
  competitors: Record<string, number>;
}

/**
 * Share of voice across a set of prompt aggregates: each entity's mention count
 * over the total mentions. Brand counts once per prompt it appears in.
 */
export function shareOfVoice(aggregates: PromptAggregate[]): ShareOfVoice {
  const brandCount = aggregates.filter((a) => a.brandMentioned).length;
  const compCounts: Record<string, number> = {};
  for (const a of aggregates) {
    for (const c of a.competitorsMentioned) {
      compCounts[c] = (compCounts[c] ?? 0) + 1;
    }
  }
  const total =
    brandCount + Object.values(compCounts).reduce((s, n) => s + n, 0);
  if (total === 0) return { brand: 0, competitors: {} };

  const competitors: Record<string, number> = {};
  for (const [name, n] of Object.entries(compCounts)) {
    competitors[name] = n / total;
  }
  return { brand: brandCount / total, competitors };
}
