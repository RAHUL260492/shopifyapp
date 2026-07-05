import { describe, it, expect } from "vitest";

import { scoreProduct, scoreStore } from "./index";
import type { ScorableProduct } from "./types";

function perfectProduct(): ScorableProduct {
  return {
    title: "Marine Collagen Peptides Powder — Unflavored 300g",
    descriptionHtml:
      "<p>Our marine collagen peptides support skin, hair, joints, and gut " +
      "health. Sourced from wild-caught fish, each serving delivers 10 grams " +
      "of hydrolyzed type I collagen that dissolves instantly in hot or cold " +
      "liquids without clumping. Unflavored and odorless, it is easy to add to " +
      "coffee, tea, smoothies, or water for daily use. Third-party tested for " +
      "purity and free from added sugar.</p>",
    vendor: "Aura Nutrition",
    productType: "Supplements",
    status: "ACTIVE",
    imageCount: 4,
    variants: [
      {
        price: "29.99",
        sku: "AN-COL-300",
        barcode: "0123456789012",
        availableForSale: true,
        inventoryQuantity: 50,
      },
    ],
    reviews: { count: 128, average: 4.6 },
    hasReturnPolicy: true,
    hasShippingPolicy: true,
  };
}

function emptyProduct(): ScorableProduct {
  return {
    title: "",
    descriptionHtml: "",
    vendor: "",
    productType: "",
    status: "DRAFT",
    imageCount: 0,
    variants: [],
    reviews: null,
    hasReturnPolicy: false,
    hasShippingPolicy: false,
  };
}

describe("scoreProduct", () => {
  it("perfect product scores 100", () => {
    expect(scoreProduct(perfectProduct()).score).toBe(100);
  });

  it("empty product scores 0", () => {
    expect(scoreProduct(emptyProduct()).score).toBe(0);
  });

  it("is deterministic: same input -> identical breakdown", () => {
    const p = perfectProduct();
    expect(scoreProduct(p)).toStrictEqual(scoreProduct(p));
  });

  it("aggregates issues from all failing rules", () => {
    const { issues } = scoreProduct(emptyProduct());
    const types = issues.map((i) => i.type);
    expect(types).toContain("missing_title");
    expect(types).toContain("missing_description");
    expect(types).toContain("no_images");
    expect(types).toContain("no_variants");
  });

  it("score is a rounded integer in [0,100]", () => {
    const s = scoreProduct({ ...perfectProduct(), imageCount: 2, reviews: null }).score;
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("scoreStore", () => {
  it("empty catalog -> 0", () => {
    expect(scoreStore([])).toBe(0);
  });

  it("mean of product scores, rounded", () => {
    // 100 and 0 -> mean 50
    expect(scoreStore([perfectProduct(), emptyProduct()])).toBe(50);
  });
});
