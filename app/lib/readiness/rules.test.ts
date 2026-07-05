import { describe, it, expect } from "vitest";

import {
  RULES,
  titleRule,
  descriptionRule,
  brandRule,
  gtinRule,
  imagesRule,
  priceRule,
  availabilityRule,
  reviewsRule,
  variantRule,
  policyRule,
  htmlToText,
  wordCount,
} from "./rules";
import type { ScorableProduct } from "./types";

// A deliberately perfect product: every rule should return ratio 1 and no issues.
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

describe("helpers", () => {
  it("htmlToText strips tags and collapses whitespace", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b></p>\n  !")).toBe(
      "Hello world !",
    );
  });
  it("wordCount handles empty and multi-space", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  ")).toBe(0);
    expect(wordCount("one   two\tthree")).toBe(3);
  });
});

describe("weights", () => {
  it("all rule weights sum to 100 (score == weighted sum)", () => {
    const perfect = perfectProduct();
    const total = RULES.reduce((s, r) => s + r(perfect).weight, 0);
    expect(total).toBe(100);
  });
});

describe("titleRule (isolated)", () => {
  it("perfect title -> 1, no issues", () => {
    const r = titleRule(perfectProduct());
    expect(r.ratio).toBe(1);
    expect(r.issues).toEqual([]);
  });
  it("empty title -> 0 with HIGH missing_title", () => {
    const r = titleRule({ ...perfectProduct(), title: "" });
    expect(r.ratio).toBe(0);
    expect(r.issues[0]).toMatchObject({ type: "missing_title", severity: "HIGH" });
  });
  it("short title -> proportional ratio + thin_title", () => {
    const r = titleRule({ ...perfectProduct(), title: "Short" }); // 5 chars
    expect(r.ratio).toBeCloseTo(5 / 20);
    expect(r.issues[0].type).toBe("thin_title");
  });
  it("all-caps title -> capped and flagged", () => {
    const r = titleRule({ ...perfectProduct(), title: "MARINE COLLAGEN PEPTIDES POWDER" });
    expect(r.ratio).toBeLessThanOrEqual(0.6);
    expect(r.issues.some((i) => i.type === "caps_title")).toBe(true);
  });
});

describe("descriptionRule (isolated)", () => {
  it("rich description -> 1", () => {
    expect(descriptionRule(perfectProduct()).ratio).toBe(1);
  });
  it("empty -> 0 HIGH missing_description", () => {
    const r = descriptionRule({ ...perfectProduct(), descriptionHtml: "" });
    expect(r.ratio).toBe(0);
    expect(r.issues[0]).toMatchObject({ type: "missing_description", severity: "HIGH" });
  });
  it("very thin (<20 words) -> 0.3", () => {
    const r = descriptionRule({ ...perfectProduct(), descriptionHtml: "<p>Collagen powder for skin.</p>" });
    expect(r.ratio).toBe(0.3);
    expect(r.issues[0].type).toBe("thin_description");
  });
  it("shallow (20-49 words) -> 0.6", () => {
    const words = Array(30).fill("word").join(" ");
    const r = descriptionRule({ ...perfectProduct(), descriptionHtml: `<p>${words}</p>` });
    expect(r.ratio).toBe(0.6);
    expect(r.issues[0].type).toBe("shallow_description");
  });
});

describe("brandRule (isolated)", () => {
  it("vendor present -> 1", () => {
    expect(brandRule(perfectProduct()).ratio).toBe(1);
  });
  it("blank vendor -> 0 + missing_brand", () => {
    const r = brandRule({ ...perfectProduct(), vendor: "  " });
    expect(r.ratio).toBe(0);
    expect(r.issues[0].type).toBe("missing_brand");
  });
});

describe("gtinRule (isolated)", () => {
  it("all variants have barcode -> 1", () => {
    expect(gtinRule(perfectProduct()).ratio).toBe(1);
  });
  it("no barcode -> 0 HIGH", () => {
    const p = perfectProduct();
    const r = gtinRule({ ...p, variants: [{ ...p.variants[0], barcode: null }] });
    expect(r.ratio).toBe(0);
    expect(r.issues[0]).toMatchObject({ type: "missing_gtin", severity: "HIGH" });
  });
  it("partial barcode -> proportional MEDIUM", () => {
    const p = perfectProduct();
    const v = p.variants[0];
    const r = gtinRule({ ...p, variants: [v, { ...v, barcode: "" }] });
    expect(r.ratio).toBe(0.5);
    expect(r.issues[0].severity).toBe("MEDIUM");
  });
});

describe("imagesRule (isolated)", () => {
  it("3+ images -> 1", () => {
    expect(imagesRule(perfectProduct()).ratio).toBe(1);
  });
  it("0 images -> 0 HIGH", () => {
    const r = imagesRule({ ...perfectProduct(), imageCount: 0 });
    expect(r.ratio).toBe(0);
    expect(r.issues[0].type).toBe("no_images");
  });
  it("1-2 images -> 0.7 LOW", () => {
    const r = imagesRule({ ...perfectProduct(), imageCount: 2 });
    expect(r.ratio).toBe(0.7);
    expect(r.issues[0].type).toBe("few_images");
  });
});

describe("priceRule (isolated)", () => {
  it("priced -> 1", () => {
    expect(priceRule(perfectProduct()).ratio).toBe(1);
  });
  it("null or zero price -> penalized HIGH", () => {
    const p = perfectProduct();
    const v = p.variants[0];
    expect(priceRule({ ...p, variants: [{ ...v, price: null }] }).ratio).toBe(0);
    const r = priceRule({ ...p, variants: [{ ...v, price: "0.00" }] });
    expect(r.ratio).toBe(0);
    expect(r.issues[0].type).toBe("missing_price");
  });
});

describe("availabilityRule (isolated)", () => {
  it("available -> 1", () => {
    expect(availabilityRule(perfectProduct()).ratio).toBe(1);
  });
  it("none available -> 0 + issue", () => {
    const p = perfectProduct();
    const r = availabilityRule({ ...p, variants: [{ ...p.variants[0], availableForSale: false }] });
    expect(r.ratio).toBe(0);
    expect(r.issues[0].type).toBe("unavailable");
  });
});

describe("reviewsRule (isolated)", () => {
  it("count + average -> 1", () => {
    expect(reviewsRule(perfectProduct()).ratio).toBe(1);
  });
  it("null reviews -> 0 LOW unknown", () => {
    const r = reviewsRule({ ...perfectProduct(), reviews: null });
    expect(r.ratio).toBe(0);
    expect(r.issues[0]).toMatchObject({ type: "reviews_unknown", severity: "LOW" });
  });
  it("zero count -> 0 MEDIUM", () => {
    const r = reviewsRule({ ...perfectProduct(), reviews: { count: 0, average: null } });
    expect(r.ratio).toBe(0);
    expect(r.issues[0].type).toBe("no_reviews");
  });
  it("count but no average -> 0.5", () => {
    const r = reviewsRule({ ...perfectProduct(), reviews: { count: 5, average: null } });
    expect(r.ratio).toBe(0.5);
    expect(r.issues[0].type).toBe("reviews_no_average");
  });
});

describe("variantRule (isolated)", () => {
  it("SKU present -> 1", () => {
    expect(variantRule(perfectProduct()).ratio).toBe(1);
  });
  it("no variants -> 0 HIGH", () => {
    const r = variantRule({ ...perfectProduct(), variants: [] });
    expect(r.ratio).toBe(0);
    expect(r.issues[0].type).toBe("no_variants");
  });
  it("missing SKU -> proportional LOW", () => {
    const p = perfectProduct();
    const v = p.variants[0];
    const r = variantRule({ ...p, variants: [v, { ...v, sku: "" }] });
    expect(r.ratio).toBe(0.5);
    expect(r.issues[0].type).toBe("missing_sku");
  });
});

describe("policyRule (isolated)", () => {
  it("both policies -> 1", () => {
    expect(policyRule(perfectProduct()).ratio).toBe(1);
  });
  it("neither -> 0 with two issues", () => {
    const r = policyRule({ ...perfectProduct(), hasReturnPolicy: false, hasShippingPolicy: false });
    expect(r.ratio).toBe(0);
    expect(r.issues.map((i) => i.type)).toEqual(["no_return_policy", "no_shipping_policy"]);
  });
  it("one policy -> 0.5", () => {
    const r = policyRule({ ...perfectProduct(), hasShippingPolicy: false });
    expect(r.ratio).toBe(0.5);
  });
});
