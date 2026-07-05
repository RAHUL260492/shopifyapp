import { describe, it, expect } from "vitest";

import { planForTier, canUseEnrichment, trackedPromptLimit } from "./plans";

describe("planForTier", () => {
  it("returns null for NONE (no subscription)", () => {
    expect(planForTier("NONE")).toBeNull();
  });

  it("returns Starter config with brief-mandated limits", () => {
    const plan = planForTier("STARTER");
    expect(plan?.priceUsd).toBe(19);
    expect(plan?.trackedPromptLimit).toBe(10);
    expect(plan?.scanCadence).toBe("weekly");
  });

  it("returns Growth config with brief-mandated limits", () => {
    const plan = planForTier("GROWTH");
    expect(plan?.priceUsd).toBe(49);
    expect(plan?.trackedPromptLimit).toBe(50);
    expect(plan?.scanCadence).toBe("daily");
  });
});

describe("canUseEnrichment", () => {
  it("blocks enrichment write-back for NONE and Starter", () => {
    expect(canUseEnrichment("NONE")).toBe(false);
    expect(canUseEnrichment("STARTER")).toBe(false);
  });

  it("allows enrichment write-back for Growth", () => {
    expect(canUseEnrichment("GROWTH")).toBe(true);
  });
});

describe("trackedPromptLimit", () => {
  it("is 0 without a subscription", () => {
    expect(trackedPromptLimit("NONE")).toBe(0);
  });

  it("matches tier limits", () => {
    expect(trackedPromptLimit("STARTER")).toBe(10);
    expect(trackedPromptLimit("GROWTH")).toBe(50);
  });
});
