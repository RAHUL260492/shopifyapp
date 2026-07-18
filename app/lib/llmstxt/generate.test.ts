import { describe, it, expect } from "vitest";

import { generateLlmsTxt, productUrl } from "./generate";

const base = {
  shopDomain: "acme.myshopify.com",
  shopName: "Acme Co",
};

describe("generateLlmsTxt", () => {
  it("lists active products with correct storefront URLs", () => {
    const out = generateLlmsTxt({
      ...base,
      products: [
        { title: "Wool Beanie", handle: "wool-beanie", status: "ACTIVE" },
        { title: "Cotton Cap", handle: "cotton-cap", status: "ACTIVE" },
      ],
    });
    expect(out).toContain("# Acme Co");
    expect(out).toContain("## Products");
    expect(out).toContain(
      "- [Wool Beanie](https://acme.myshopify.com/products/wool-beanie)",
    );
    expect(out).toContain(
      "- [Cotton Cap](https://acme.myshopify.com/products/cotton-cap)",
    );
    expect(out.endsWith("\n")).toBe(true);
  });

  it("excludes draft and archived products (QA-6: no leaks)", () => {
    const out = generateLlmsTxt({
      ...base,
      products: [
        { title: "Live", handle: "live", status: "ACTIVE" },
        { title: "Secret Draft", handle: "secret-draft", status: "DRAFT" },
        { title: "Old", handle: "old", status: "ARCHIVED" },
      ],
    });
    expect(out).toContain("live");
    expect(out).not.toContain("Secret Draft");
    expect(out).not.toContain("secret-draft");
    expect(out).not.toContain("Old");
  });

  it("excludes products with an empty handle", () => {
    const out = generateLlmsTxt({
      ...base,
      products: [{ title: "No Handle", handle: "", status: "ACTIVE" }],
    });
    expect(out).not.toContain("No Handle");
  });

  it("sanitizes brackets in titles so links stay well-formed", () => {
    const out = generateLlmsTxt({
      ...base,
      products: [{ title: "Widget [NEW]", handle: "widget", status: "ACTIVE" }],
    });
    expect(out).toContain("- [Widget NEW](https://acme.myshopify.com/products/widget)");
  });

  it("falls back to the domain when no shop name is given", () => {
    const out = generateLlmsTxt({
      shopDomain: "acme.myshopify.com",
      products: [],
    });
    expect(out).toContain("# acme.myshopify.com");
    expect(out).toContain("0 published products");
  });
});

describe("productUrl", () => {
  it("builds an https storefront product URL", () => {
    expect(productUrl("acme.myshopify.com", "beanie")).toBe(
      "https://acme.myshopify.com/products/beanie",
    );
  });
});
