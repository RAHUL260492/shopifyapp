import { describe, it, expect } from "vitest";

import { planNameToKey, managedPricingUrl } from "./plan.server";

describe("planNameToKey", () => {
  it("maps Managed Pricing plan names to keys", () => {
    expect(planNameToKey("Pro")).toBe("PRO");
    expect(planNameToKey("Growth")).toBe("GROWTH");
    expect(planNameToKey("Starter")).toBe("STARTER");
  });
  it("is case-insensitive", () => {
    expect(planNameToKey("growth plan")).toBe("GROWTH");
  });
  it("defaults to FREE when there is no paid subscription", () => {
    expect(planNameToKey(undefined)).toBe("FREE");
    expect(planNameToKey(null)).toBe("FREE");
    expect(planNameToKey("")).toBe("FREE");
  });
});

describe("managedPricingUrl", () => {
  it("builds the admin pricing URL from the store handle", () => {
    expect(managedPricingUrl("acme.myshopify.com")).toBe(
      "https://admin.shopify.com/store/acme/charges/cited/pricing_plans",
    );
  });
});
