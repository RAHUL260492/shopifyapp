// Generate enrichment drafts for one product: fetch current fields, call the
// LLM, parse+sanitize, log cost to LlmUsage, and persist EnrichmentDraft rows
// in DRAFT status (never applied here — write-back needs explicit approval).

import prisma from "../../db.server";
import { costCents } from "../llm/cost";
import { getEnrichmentProvider } from "../llm/index.server";
import type { AdminGraphqlClient } from "../products/sync.server";
import {
  ENRICHMENT_JSON_SCHEMA,
  ENRICHMENT_SYSTEM,
  buildEnrichmentUserContent,
  parseEnrichmentResponse,
} from "./prompt";
import type { EnrichmentResult } from "./prompt";

const PRODUCT_FIELDS_QUERY = `#graphql
  query CitedEnrichmentFields($id: ID!) {
    product(id: $id) {
      id
      title
      vendor
      productType
      descriptionHtml
    }
  }
`;

export class EnrichmentNotConfiguredError extends Error {
  constructor() {
    super("AI enrichment is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "EnrichmentNotConfiguredError";
  }
}

interface GqlProductFields {
  product: {
    id: string;
    title: string | null;
    vendor: string | null;
    productType: string | null;
    descriptionHtml: string | null;
  } | null;
}

/**
 * Generate and persist fresh enrichment drafts for a product. Replaces any
 * prior DRAFT rows for the product (keeps applied history intact). Returns the
 * parsed result for immediate display.
 */
export async function generateEnrichment(
  admin: AdminGraphqlClient,
  shopId: string,
  productDbId: string,
): Promise<EnrichmentResult> {
  const provider = getEnrichmentProvider();
  if (!provider) throw new EnrichmentNotConfiguredError();

  const product = await prisma.product.findFirst({
    where: { id: productDbId, shopId },
  });
  if (!product) throw new Error("Product not found.");

  // Fetch current fields fresh from Shopify (source of truth for originalValue).
  const res = await admin.graphql(PRODUCT_FIELDS_QUERY, {
    variables: { id: product.shopifyGid },
  });
  const body = (await res.json()) as { data?: GqlProductFields };
  const node = body.data?.product;
  if (!node) throw new Error("Product no longer exists in Shopify.");

  const result = await provider.generate({
    system: ENRICHMENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildEnrichmentUserContent({
          title: node.title ?? "",
          descriptionHtml: node.descriptionHtml ?? "",
          vendor: node.vendor ?? "",
          productType: node.productType ?? "",
        }),
      },
    ],
    jsonSchema: ENRICHMENT_JSON_SCHEMA,
    maxTokens: 4096,
  });

  // Cost logging — every call, always (brief §3).
  await prisma.llmUsage.create({
    data: {
      shopId,
      provider: provider.name,
      model: result.model,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costCents: costCents(
        result.model,
        result.usage.inputTokens,
        result.usage.outputTokens,
      ),
      purpose: "enrichment",
    },
  });

  const parsed = parseEnrichmentResponse(result.text);

  // Persist drafts: replace prior DRAFTs, capture originalValue for rollback.
  await prisma.$transaction(async (tx) => {
    await tx.enrichmentDraft.deleteMany({
      where: { productId: productDbId, status: "DRAFT" },
    });
    await tx.enrichmentDraft.create({
      data: {
        productId: productDbId,
        field: "description",
        originalValue: node.descriptionHtml ?? "",
        aiValue: parsed.descriptionHtml,
        status: "DRAFT",
      },
    });
    if (parsed.faq.length > 0) {
      await tx.enrichmentDraft.create({
        data: {
          productId: productDbId,
          field: "faq",
          originalValue: null,
          aiValue: JSON.stringify(parsed.faq),
          status: "DRAFT",
        },
      });
    }
    if (parsed.attributes.length > 0) {
      await tx.enrichmentDraft.create({
        data: {
          productId: productDbId,
          field: "attributes",
          originalValue: null,
          aiValue: JSON.stringify(parsed.attributes),
          status: "DRAFT",
        },
      });
    }
  });

  return parsed;
}
