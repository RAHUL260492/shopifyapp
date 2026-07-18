// Pure mapping layer: Admin GraphQL product node -> ScorableProduct.
// Kept separate from the sync I/O so it can be unit-tested without a live API.
// The readiness engine only ever sees the normalized ScorableProduct shape.

import type { ScorableProduct, ScorableVariant } from "../readiness/types";

// --- Shapes of the Admin GraphQL response we consume (subset of the schema) ---

export interface GqlVariantNode {
  price: string | null;
  sku: string | null;
  barcode: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
}

export interface GqlMediaNode {
  mediaContentType: string; // "IMAGE" | "VIDEO" | "EXTERNAL_VIDEO" | "MODEL_3D"
}

export interface GqlProductNode {
  id: string; // gid://shopify/Product/123
  title: string | null;
  handle: string | null;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  vendor: string | null;
  productType: string | null;
  descriptionHtml: string | null;
  media: { nodes: GqlMediaNode[] };
  variants: { nodes: GqlVariantNode[] };
}

/** Store-level policy presence, resolved once per sync and shared by all products. */
export interface StorePolicies {
  hasReturnPolicy: boolean;
  hasShippingPolicy: boolean;
}

/** Map a single GraphQL variant node to the engine's variant shape. */
function mapVariant(v: GqlVariantNode): ScorableVariant {
  return {
    price: v.price ?? null,
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
    availableForSale: v.availableForSale ?? false,
    inventoryQuantity: v.inventoryQuantity ?? null,
  };
}

/**
 * Map an Admin GraphQL product node to a ScorableProduct.
 * Pure & deterministic. Review data is null here — a review-source adapter is a
 * later enhancement (the reviews rule nudges the merchant when unknown).
 */
export function mapProductNode(
  node: GqlProductNode,
  policies: StorePolicies,
): ScorableProduct {
  const imageCount = node.media.nodes.filter(
    (m) => m.mediaContentType === "IMAGE",
  ).length;

  return {
    title: node.title ?? "",
    descriptionHtml: node.descriptionHtml ?? "",
    vendor: node.vendor ?? "",
    productType: node.productType ?? "",
    status: node.status,
    imageCount,
    variants: node.variants.nodes.map(mapVariant),
    reviews: null,
    hasReturnPolicy: policies.hasReturnPolicy,
    hasShippingPolicy: policies.hasShippingPolicy,
  };
}
