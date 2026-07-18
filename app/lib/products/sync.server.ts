// Catalog sync: pull the merchant's products via Admin GraphQL, score each with
// the (pure) readiness engine, and persist Product + ProductIssue rows.
//
// Scaling note (QA-2, 5k-catalog gate): this uses cursor pagination with small,
// cost-bounded pages and throttle-aware backoff — correct and safe for typical
// catalogs. Very large catalogs should move to Shopify Bulk Operations
// (bulkOperationRunQuery); the pure mapping/scoring layer is already decoupled
// so that swap is isolated to this file. Tracked as a follow-up.

import prisma from "../../db.server";
import { scoreProduct } from "../readiness";
import type { IssueSeverity } from "../readiness/types";
import { mapProductNode } from "./map";
import type { GqlProductNode, StorePolicies } from "./map";

// Minimal shape of the Admin GraphQL client from `authenticate.admin`.
export interface AdminGraphqlClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<unknown> }>;
}

// Products per page. Kept small so the estimated query cost stays well under
// Shopify's 1000-point single-query ceiling (variants(100) dominates cost).
const PAGE_SIZE = 8;

const POLICIES_QUERY = `#graphql
  query CitedShopPolicies {
    shop {
      shopPolicies {
        type
        body
      }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query CitedCatalogSync($cursor: String, $pageSize: Int!) {
    products(first: $pageSize, after: $cursor, sortKey: TITLE) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        descriptionHtml
        media(first: 5) {
          nodes {
            mediaContentType
          }
        }
        variants(first: 100) {
          nodes {
            price
            sku
            barcode
            availableForSale
            inventoryQuantity
          }
        }
      }
    }
  }
`;

interface ThrottleStatus {
  currentlyAvailable: number;
  restoreRate: number;
}

interface GqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: { throttleStatus?: ThrottleStatus } };
}

/** Non-blocking sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a query and, if throttled, wait for the leaky bucket to refill and retry.
 * Shopify returns 200 with an errors[] entry coded THROTTLED plus a cost
 * envelope telling us the restore rate.
 */
async function runQuery<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
): Promise<T> {
  const res = await admin.graphql(query, { variables });
  const body = (await res.json()) as GqlEnvelope<T>;

  const throttled = body.errors?.some(
    (e) => e.extensions?.code === "THROTTLED",
  );
  if (throttled && attempt < 5) {
    const status = body.extensions?.cost?.throttleStatus;
    // Wait roughly one page's worth of points to restore, min 1s.
    const waitMs = status
      ? Math.max(1000, (500 / Math.max(status.restoreRate, 1)) * 1000)
      : 2000;
    await sleep(waitMs);
    return runQuery<T>(admin, query, variables, attempt + 1);
  }

  if (body.errors?.length) {
    throw new Error(
      `Admin GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!body.data) {
    throw new Error("Admin GraphQL returned no data.");
  }
  return body.data;
}

/** Resolve store-level return/shipping policy presence once per sync. */
export async function fetchStorePolicies(
  admin: AdminGraphqlClient,
): Promise<StorePolicies> {
  const data = await runQuery<{
    shop: { shopPolicies: Array<{ type: string; body: string | null }> };
  }>(admin, POLICIES_QUERY, {});

  const present = (type: string) =>
    data.shop.shopPolicies.some(
      (p) => p.type === type && (p.body ?? "").trim() !== "",
    );

  return {
    hasReturnPolicy: present("REFUND_POLICY"),
    hasShippingPolicy: present("SHIPPING_POLICY"),
  };
}

/**
 * Persist one scored product and replace its issue list, atomically.
 * Returns the product's readiness score so callers can roll up a store score
 * without re-scoring.
 */
async function persistProduct(
  shopId: string,
  node: GqlProductNode,
  policies: StorePolicies,
): Promise<number> {
  const scorable = mapProductNode(node, policies);
  const breakdown = scoreProduct(scorable);

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { shopId_shopifyGid: { shopId, shopifyGid: node.id } },
      create: {
        shopId,
        shopifyGid: node.id,
        title: scorable.title,
        handle: node.handle ?? "",
        syncedAt: new Date(),
        readinessScore: breakdown.score,
        scoreBreakdown: breakdown as unknown as object,
      },
      update: {
        title: scorable.title,
        handle: node.handle ?? "",
        syncedAt: new Date(),
        readinessScore: breakdown.score,
        scoreBreakdown: breakdown as unknown as object,
      },
    });

    // Issues are derived state — replace wholesale so a fixed product clears.
    await tx.productIssue.deleteMany({ where: { productId: product.id } });
    if (breakdown.issues.length > 0) {
      await tx.productIssue.createMany({
        data: breakdown.issues.map((i) => ({
          productId: product.id,
          type: i.type,
          severity: i.severity as IssueSeverity,
          suggestion: { message: i.message },
        })),
      });
    }
  });

  return breakdown.score;
}

export interface SyncSummary {
  productCount: number;
  storeScore: number;
}

/**
 * Full catalog sync for one shop. Paginates the catalog, scores every product,
 * persists results, and returns a summary. Returns the store-level score as the
 * mean of per-product scores.
 */
export async function syncCatalog(
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<SyncSummary> {
  const policies = await fetchStorePolicies(admin);

  let cursor: string | null = null;
  let productCount = 0;
  let scoreSum = 0;

  do {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GqlProductNode[];
      };
    } = await runQuery(admin, PRODUCTS_QUERY, {
      cursor,
      pageSize: PAGE_SIZE,
    });

    for (const node of data.products.nodes) {
      scoreSum += await persistProduct(shopId, node, policies);
      productCount += 1;
    }

    cursor = data.products.pageInfo.hasNextPage
      ? data.products.pageInfo.endCursor
      : null;
  } while (cursor);

  const storeScore =
    productCount === 0 ? 0 : Math.round(scoreSum / productCount);
  return { productCount, storeScore };
}

/**
 * Incremental single-product sync (webhook-driven). Fetches one product by id,
 * re-scores, and persists. No-op if the product no longer exists.
 */
const SINGLE_PRODUCT_QUERY = `#graphql
  query CitedProductSync($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      vendor
      productType
      descriptionHtml
      media(first: 5) {
        nodes {
          mediaContentType
        }
      }
      variants(first: 100) {
        nodes {
          price
          sku
          barcode
          availableForSale
          inventoryQuantity
        }
      }
    }
  }
`;

export async function syncSingleProduct(
  admin: AdminGraphqlClient,
  shopId: string,
  productGid: string,
): Promise<void> {
  const policies = await fetchStorePolicies(admin);
  const data = await runQuery<{ product: GqlProductNode | null }>(
    admin,
    SINGLE_PRODUCT_QUERY,
    { id: productGid },
  );
  if (!data.product) return;
  await persistProduct(shopId, data.product, policies);
}

/** Remove a product (and cascade its issues) after a products/delete webhook. */
export async function deleteProduct(
  shopId: string,
  productGid: string,
): Promise<void> {
  await prisma.product.deleteMany({
    where: { shopId, shopifyGid: productGid },
  });
}
