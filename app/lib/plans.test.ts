import { describe, it, expect } from "vitest";

import { planForTier, canUseEnrichment, trackedPromptLimit } from "./plans";

describe("planForTier", () => {
  it("returns null for NONE (no plan chosen yet)", () => {
    expect(planForTier("NONE")).toBeNull();
  });

  it("returns the Free tier as a real $0 plan", () => {
    const plan = planForTier("FREE");
    expect(plan?.priceUsd).toBe(0);
    expect(plan?.trackedPromptLimit).toBe(3);
    expect(plan?.enrichmentWriteback).toBe(false);
  });

  it("returns Pro config with the highest limits", () => {
    const plan = planForTier("PRO");
    expect(plan?.priceUsd).toBe(99);
    expect(plan?.trackedPromptLimit).toBe(200);
    expect(plan?.scanCadence).toBe("daily");
    expect(plan?.enrichmentWriteback).toBe(true);
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
