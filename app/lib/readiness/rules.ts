// Individual scoring rules. Each rule is a pure function of a ScorableProduct
// and returns a normalized 0..1 ratio, a fixed weight, and any issues it found.
// Weights across all rules sum to 100 (see RULES below), so the store/product
// score is simply the weighted sum. Rules are deterministic: same input -> same
// output, no randomness, no clock, no I/O.

import type { Rule, ReadinessIssue, ScorableProduct } from "./types";

// --- helpers (pure) ---

/** Strip HTML tags and collapse whitespace. Deterministic. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Count whitespace-delimited words in plain text. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

function issue(
  type: string,
  severity: ReadinessIssue["severity"],
  message: string,
): ReadinessIssue {
  return { type, severity, message };
}

// --- rules ---

// Title: AI engines favour descriptive, well-scoped titles. Ideal length is
// ~20-70 chars. Too short lacks intent; ALL CAPS reads as spam.
export const titleRule: Rule = (p) => {
  const title = p.title.trim();
  const len = title.length;
  const issues: ReadinessIssue[] = [];
  let ratio = 1;

  if (len === 0) {
    ratio = 0;
    issues.push(issue("missing_title", "HIGH", "Product has no title."));
  } else if (len < 20) {
    ratio = len / 20; // scales up toward the 20-char floor
    issues.push(
      issue("thin_title", "MEDIUM", "Title is short; add descriptive detail."),
    );
  } else if (len > 70) {
    ratio = 0.8;
    issues.push(
      issue("long_title", "LOW", "Title is long; front-load key terms."),
    );
  }

  // ALL-CAPS penalty (only when there are enough letters to judge).
  const letters = title.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 6 && title === title.toUpperCase()) {
    ratio = Math.min(ratio, 0.6);
    issues.push(issue("caps_title", "LOW", "Avoid all-caps titles."));
  }

  return { id: "title", label: "Title quality", ratio, weight: 10, issues };
};

// Description: depth/intent coverage. v1 heuristic uses word count of the
// stripped text (NLP intent modelling is a later enhancement).
export const descriptionRule: Rule = (p) => {
  const words = wordCount(htmlToText(p.descriptionHtml));
  const issues: ReadinessIssue[] = [];
  let ratio: number;

  if (words === 0) {
    ratio = 0;
    issues.push(
      issue("missing_description", "HIGH", "Product has no description."),
    );
  } else if (words < 20) {
    ratio = 0.3;
    issues.push(
      issue("thin_description", "HIGH", "Description is very thin (<20 words)."),
    );
  } else if (words < 50) {
    ratio = 0.6;
    issues.push(
      issue(
        "shallow_description",
        "MEDIUM",
        "Description is short; cover use, materials, and buyer intent.",
      ),
    );
  } else {
    ratio = 1;
  }

  return {
    id: "description",
    label: "Description depth",
    ratio,
    weight: 15,
    issues,
  };
};

// Brand presence: vendor should be set (Organization/brand signals).
export const brandRule: Rule = (p) => {
  const ok = p.vendor.trim() !== "";
  return {
    id: "brand",
    label: "Brand present",
    ratio: ok ? 1 : 0,
    weight: 8,
    issues: ok
      ? []
      : [issue("missing_brand", "MEDIUM", "No brand/vendor set on product.")],
  };
};

// GTIN presence: share of variants carrying a barcode (GTIN/UPC/EAN).
export const gtinRule: Rule = (p) => {
  const total = p.variants.length;
  const withBarcode = p.variants.filter(
    (v) => (v.barcode ?? "").trim() !== "",
  ).length;
  const ratio = total === 0 ? 0 : withBarcode / total;
  const issues: ReadinessIssue[] =
    ratio < 1
      ? [
          issue(
            "missing_gtin",
            ratio === 0 ? "HIGH" : "MEDIUM",
            "One or more variants are missing a GTIN/barcode.",
          ),
        ]
      : [];
  return { id: "gtin", label: "GTIN / barcode", ratio, weight: 10, issues };
};

// Images: at least one required; 3+ is ideal for AI/visual surfaces.
export const imagesRule: Rule = (p) => {
  const n = p.imageCount;
  const issues: ReadinessIssue[] = [];
  let ratio: number;
  if (n === 0) {
    ratio = 0;
    issues.push(issue("no_images", "HIGH", "Product has no images."));
  } else if (n < 3) {
    ratio = 0.7;
    issues.push(
      issue("few_images", "LOW", "Add more images (3+ recommended)."),
    );
  } else {
    ratio = 1;
  }
  return { id: "images", label: "Images", ratio, weight: 12, issues };
};

// Price: every variant must have a positive price.
export const priceRule: Rule = (p) => {
  const total = p.variants.length;
  const priced = p.variants.filter((v) => {
    const n = v.price === null ? NaN : Number(v.price);
    return Number.isFinite(n) && n > 0;
  }).length;
  const ratio = total === 0 ? 0 : priced / total;
  const issues: ReadinessIssue[] =
    ratio < 1
      ? [issue("missing_price", "HIGH", "One or more variants have no price.")]
      : [];
  return { id: "price", label: "Price set", ratio, weight: 10, issues };
};

// Availability: purchasable variants (availableForSale) signal live inventory.
export const availabilityRule: Rule = (p) => {
  const total = p.variants.length;
  const available = p.variants.filter((v) => v.availableForSale).length;
  const ratio = total === 0 ? 0 : available / total;
  const issues: ReadinessIssue[] =
    available === 0
      ? [
          issue(
            "unavailable",
            "MEDIUM",
            "No variants are available for sale.",
          ),
        ]
      : [];
  return {
    id: "availability",
    label: "Availability",
    ratio,
    weight: 8,
    issues,
  };
};

// Reviews: presence + a sane average feeds AggregateRating. Unknown (null)
// scores 0 with a LOW nudge rather than penalising as harshly as "zero reviews".
export const reviewsRule: Rule = (p) => {
  const issues: ReadinessIssue[] = [];
  let ratio: number;
  if (p.reviews === null) {
    ratio = 0;
    issues.push(
      issue(
        "reviews_unknown",
        "LOW",
        "No review data detected; connect a review source.",
      ),
    );
  } else if (p.reviews.count === 0) {
    ratio = 0;
    issues.push(issue("no_reviews", "MEDIUM", "Product has no reviews yet."));
  } else if (p.reviews.average === null) {
    ratio = 0.5;
    issues.push(
      issue("reviews_no_average", "LOW", "Review count found but no rating."),
    );
  } else {
    ratio = 1;
  }
  return { id: "reviews", label: "Reviews", ratio, weight: 10, issues };
};

// Variant cleanliness: variants should carry SKUs for clean feed data.
export const variantRule: Rule = (p) => {
  const total = p.variants.length;
  if (total === 0) {
    return {
      id: "variants",
      label: "Variant data",
      ratio: 0,
      weight: 9,
      issues: [issue("no_variants", "HIGH", "Product has no variants.")],
    };
  }
  const withSku = p.variants.filter((v) => (v.sku ?? "").trim() !== "").length;
  const ratio = withSku / total;
  const issues: ReadinessIssue[] =
    ratio < 1
      ? [issue("missing_sku", "LOW", "One or more variants are missing a SKU.")]
      : [];
  return { id: "variants", label: "Variant data", ratio, weight: 9, issues };
};

// Policies: return + shipping policy presence (store-level, half each).
export const policyRule: Rule = (p) => {
  const parts = [p.hasReturnPolicy, p.hasShippingPolicy];
  const ratio = parts.filter(Boolean).length / parts.length;
  const issues: ReadinessIssue[] = [];
  if (!p.hasReturnPolicy) {
    issues.push(issue("no_return_policy", "LOW", "No return policy detected."));
  }
  if (!p.hasShippingPolicy) {
    issues.push(
      issue("no_shipping_policy", "LOW", "No shipping policy detected."),
    );
  }
  return { id: "policies", label: "Policies", ratio, weight: 8, issues };
};

// Ordered rule set. Weights sum to 100 (asserted in tests).
export const RULES: Rule[] = [
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
];
