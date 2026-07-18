import { describe, it, expect } from "vitest";

import { normalizeTopic, complianceTopic } from "./topics";

describe("normalizeTopic", () => {
  it("canonicalizes slash and enum spellings to UPPER_SNAKE", () => {
    expect(normalizeTopic("customers/data_request")).toBe(
      "CUSTOMERS_DATA_REQUEST",
    );
    expect(normalizeTopic("CUSTOMERS_DATA_REQUEST")).toBe(
      "CUSTOMERS_DATA_REQUEST",
    );
    expect(normalizeTopic("shop/redact")).toBe("SHOP_REDACT");
    expect(normalizeTopic("app/uninstalled")).toBe("APP_UNINSTALLED");
  });
});

describe("complianceTopic", () => {
  it("recognizes the three mandatory GDPR topics in either spelling", () => {
    expect(complianceTopic("customers/data_request")).toBe(
      "CUSTOMERS_DATA_REQUEST",
    );
    expect(complianceTopic("CUSTOMERS_REDACT")).toBe("CUSTOMERS_REDACT");
    expect(complianceTopic("shop/redact")).toBe("SHOP_REDACT");
  });

  it("returns null for non-compliance topics", () => {
    expect(complianceTopic("app/uninstalled")).toBeNull();
    expect(complianceTopic("products/create")).toBeNull();
  });
});
