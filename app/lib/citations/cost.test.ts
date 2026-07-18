import { describe, it, expect } from "vitest";

import { callCostCents, wouldExceedCap, DEFAULT_DAILY_CAP_CENTS } from "./cost";
import { aggregateSamples, shareOfVoice } from "./aggregate";
import type { CitationParseResult } from "./parse";

function result(over: Partial<CitationParseResult> = {}): CitationParseResult {
  return {
    brandMentioned: false,
    productsMentioned: [],
    competitorsMentioned: [],
    citedDomains: [],
    ambiguous: [],
    empty: false,
    ...over,
  };
}

describe("callCostCents", () => {
  it("prices gpt-4o and mock", () => {
    expect(callCostCents("gpt-4o", 1_000_000, 1_000_000)).toBe(1250); // $12.50
    expect(callCostCents("mock-1", 1000, 1000)).toBe(0);
  });
});

describe("wouldExceedCap", () => {
  it("hard-stops when the next call crosses the cap", () => {
    expect(wouldExceedCap(190, 20, DEFAULT_DAILY_CAP_CENTS)).toBe(true);
    expect(wouldExceedCap(150, 20, DEFAULT_DAILY_CAP_CENTS)).toBe(false);
    expect(wouldExceedCap(200, 1, DEFAULT_DAILY_CAP_CENTS)).toBe(true);
  });
});

describe("aggregateSamples (3-sample smoothing)", () => {
  it("counts a signal if it appears in any sample", () => {
    const agg = aggregateSamples([
      result({ brandMentioned: false }),
      result({ brandMentioned: true, competitorsMentioned: ["Globex"] }),
      result({ brandMentioned: false, citedDomains: ["x.com"] }),
    ]);
    expect(agg.brandMentioned).toBe(true);
    expect(agg.brandVisibility).toBeCloseTo(1 / 3);
    expect(agg.competitorsMentioned).toEqual(["Globex"]);
    expect(agg.citedDomains).toEqual(["x.com"]);
  });

  it("counts empty samples", () => {
    const agg = aggregateSamples([result({ empty: true }), result()]);
    expect(agg.emptyCount).toBe(1);
  });

  it("handles zero samples", () => {
    expect(aggregateSamples([]).brandVisibility).toBe(0);
  });
});

describe("shareOfVoice", () => {
  it("splits mentions between brand and competitors", () => {
    const sov = shareOfVoice([
      aggregateSamples([result({ brandMentioned: true })]),
      aggregateSamples([result({ competitorsMentioned: ["Globex"] })]),
    ]);
    expect(sov.brand).toBeCloseTo(0.5);
    expect(sov.competitors.Globex).toBeCloseTo(0.5);
  });

  it("returns zeros when there are no mentions", () => {
    const sov = shareOfVoice([aggregateSamples([result()])]);
    expect(sov.brand).toBe(0);
    expect(sov.competitors).toEqual({});
  });
});
