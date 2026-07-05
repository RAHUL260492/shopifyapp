// Readiness engine — shared types.
// The engine scores a *normalized* product shape (ScorableProduct), deliberately
// decoupled from the Admin GraphQL response so every rule is a pure, testable
// function. The catalog-sync layer maps GraphQL -> ScorableProduct.

export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface ReadinessIssue {
  /** Stable machine key, e.g. "missing_gtin". Maps to ProductIssue.type. */
  type: string;
  severity: IssueSeverity;
  /** Human-readable, merchant-facing explanation. */
  message: string;
}

export interface ScorableVariant {
  price: string | null; // Shopify money is a decimal string
  sku: string | null;
  barcode: string | null; // GTIN/UPC/EAN lives in variant.barcode
  availableForSale: boolean;
  inventoryQuantity: number | null;
}

export interface ScorableProduct {
  title: string;
  /** Raw product description HTML (body_html / descriptionHtml). */
  descriptionHtml: string;
  /** Brand — Shopify vendor field. */
  vendor: string;
  productType: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  imageCount: number;
  variants: ScorableVariant[];
  /** Aggregated review signal from a review app / metafields; null if unknown. */
  reviews: { count: number; average: number | null } | null;
  /** Store-level policy presence, passed in from shop settings. */
  hasReturnPolicy: boolean;
  hasShippingPolicy: boolean;
}

export interface RuleResult {
  id: string;
  label: string;
  /** Normalized 0..1 quality for this rule. */
  ratio: number;
  /** Fixed weight; the engine's weights sum to 100 so score == sum(ratio*weight). */
  weight: number;
  issues: ReadinessIssue[];
}

export interface ScoreBreakdown {
  /** 0..100 integer, deterministic for a given input. */
  score: number;
  rules: RuleResult[];
  issues: ReadinessIssue[];
}

export type Rule = (product: ScorableProduct) => RuleResult;
