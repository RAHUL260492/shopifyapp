import { describe, it, expect } from "vitest";

import { costUsd, costCents } from "./cost";

describe("costUsd", () => {
  it("prices Opus 4.8 at $5/1M in and $25/1M out", () => {
    // 1M in + 1M out = $5 + $25 = $30
    expect(costUsd("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(30);
  });

  it("uses a fallback price for unknown models", () => {
    expect(costUsd("some-future-model", 1_000_000, 0)).toBeCloseTo(5);
  });
});

describe("costCents", () => {
  it("rounds a typical enrichment call to whole cents", () => {
    // 2k in + 1k out = 2000/1e6*5 + 1000/1e6*25 = 0.01 + 0.025 = $0.035 -> 4c
    expect(costCents("claude-opus-4-8", 2000, 1000)).toBe(4);
  });

  it("rounds sub-cent calls to 0", () => {
    expect(costCents("claude-opus-4-8", 100, 10)).toBe(0);
  });
});
