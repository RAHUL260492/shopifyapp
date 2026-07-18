import { describe, it, expect } from "vitest";

import { mapProductNode } from "./map";
import type { GqlProductNode, StorePolicies } from "./map";

const POLICIES: StorePolicies = {
  hasReturnPolicy: true,
  hasShippingPolicy: false,
};

function node(overrides: Partial<GqlProductNode> = {}): GqlProductNode {
  return {
    id: "gid://shopify/Product/1",
    title: "Merino Wool Beanie",
    handle: "merino-wool-beanie",
    status: "ACTIVE",
    vendor: "Acme",
    productType: "Hat",
    descriptionHtml: "<p>Warm and soft.</p>",
    media: { nodes: [{ mediaContentType: "IMAGE" }] },
    variants: {
      nodes: [
        {
          price: "24.00",
          sku: "BEANIE-1",
          barcode: "0123456789012",
          availableForSale: true,
          inventoryQuantity: 5,
        },
      ],
    },
    ...overrides,
  };
}

describe("mapProductNode", () => {
  it("maps a fully-populated node to the engine shape", () => {
    const p = mapProductNode(node(), POLICIES);
    expect(p.title).toBe("Merino Wool Beanie");
    expect(p.descriptionHtml).toBe("<p>Warm and soft.</p>");
    expect(p.vendor).toBe("Acme");
    expect(p.productType).toBe("Hat");
    expect(p.status).toBe("ACTIVE");
    expect(p.imageCount).toBe(1);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toEqual({
      price: "24.00",
      sku: "BEANIE-1",
      barcode: "0123456789012",
      availableForSale: true,
      inventoryQuantity: 5,
    });
    expect(p.reviews).toBeNull();
  });

  it("counts only IMAGE media, ignoring video and 3D", () => {
    const p = mapProductNode(
      node({
        media: {
          nodes: [
            { mediaContentType: "IMAGE" },
            { mediaContentType: "VIDEO" },
            { mediaContentType: "IMAGE" },
            { mediaContentType: "MODEL_3D" },
          ],
        },
      }),
      POLICIES,
    );
    expect(p.imageCount).toBe(2);
  });

  it("coerces null scalar fields to empty strings / defaults", () => {
    const p = mapProductNode(
      node({
        title: null,
        descriptionHtml: null,
        vendor: null,
        productType: null,
        media: { nodes: [] },
        variants: {
          nodes: [
            {
              price: null,
              sku: null,
              barcode: null,
              availableForSale: false,
              inventoryQuantity: null,
            },
          ],
        },
      }),
      POLICIES,
    );
    expect(p.title).toBe("");
    expect(p.descriptionHtml).toBe("");
    expect(p.vendor).toBe("");
    expect(p.productType).toBe("");
    expect(p.imageCount).toBe(0);
    expect(p.variants[0].price).toBeNull();
    expect(p.variants[0].availableForSale).toBe(false);
  });

  it("passes store policies through to every product", () => {
    const p = mapProductNode(node(), POLICIES);
    expect(p.hasReturnPolicy).toBe(true);
    expect(p.hasShippingPolicy).toBe(false);
  });
});
