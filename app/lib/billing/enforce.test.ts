import { describe, it, expect } from "vitest";

import {
  canEnrich,
  promptLimit,
  competitorLimit,
  scanCadence,
  assertCanEnrich,
  assertWithinPromptLimit,
  assertWithinCompetitorLimit,
  TierLimitError,
} from "./enforce";

describe("capabilities by tier", () => {
  it("enrichment: Growth & Pro only", () => {
    expect(canEnrich("FREE")).toBe(false);
    expect(canEnrich("STARTER")).toBe(false);
    expect(canEnrich("GROWTH")).toBe(true);
    expect(canEnrich("PRO")).toBe(true);
  });

  it("prompt limits match the 4-tier config", () => {
    expect(promptLimit("FREE")).toBe(3);
    expect(promptLimit("STARTER")).toBe(10);
    expect(promptLimit("GROWTH")).toBe(50);
    expect(promptLimit("PRO")).toBe(200);
  });

  it("scan cadence steps up with tier", () => {
    expect(scanCadence("FREE")).toBe("weekly");
    expect(scanCadence("STARTER")).toBe("weekly");
    expect(scanCadence("GROWTH")).toBe("daily");
    expect(scanCadence("PRO")).toBe("daily");
  });

  it("competitor limits scale with tier", () => {
    expect(competitorLimit("FREE")).toBe(0);
    expect(competitorLimit("STARTER")).toBe(1);
    expect(competitorLimit("GROWTH")).toBe(3);
    expect(competitorLimit("PRO")).toBe(10);
  });
});

describe("assertCanEnrich (QA-7 server-side enforcement)", () => {
  it("blocks Free and Starter", () => {
    expect(() => assertCanEnrich("FREE")).toThrow(TierLimitError);
    expect(() => assertCanEnrich("STARTER")).toThrow(TierLimitError);
  });
  it("allows Growth and Pro", () => {
    expect(() => assertCanEnrich("GROWTH")).not.toThrow();
    expect(() => assertCanEnrich("PRO")).not.toThrow();
  });
});

describe("assertWithinPromptLimit", () => {
  it("allows up to the limit and blocks at/over it", () => {
    expect(() => assertWithinPromptLimit("STARTER", 9)).not.toThrow();
    expect(() => assertWithinPromptLimit("STARTER", 10)).toThrow(TierLimitError);
    expect(() => assertWithinPromptLimit("STARTER", 11)).toThrow(TierLimitError);
  });
});

describe("assertWithinCompetitorLimit", () => {
  it("blocks Free (0 competitors) and enforces paid limits", () => {
    expect(() => assertWithinCompetitorLimit("FREE", 0)).toThrow(TierLimitError);
    expect(() => assertWithinCompetitorLimit("GROWTH", 2)).not.toThrow();
    expect(() => assertWithinCompetitorLimit("GROWTH", 3)).toThrow(
      TierLimitError,
    );
  });
});
