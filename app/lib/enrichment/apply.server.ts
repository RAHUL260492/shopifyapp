// Approve / apply / reject / rollback for enrichment drafts.
// Every write-back passes assertApproved() (the approval gate) before touching
// the store, and every applied change captures enough state to be rolled back.

import prisma from "../../db.server";
import type { AdminGraphqlClient } from "../products/sync.server";
import { assertApproved } from "./gate";

const METAFIELD_NAMESPACE = "cited";

// NOTE: verify against Shopify Admin GraphQL 2026-07 before the live write-back
// QA — recent versions use `productUpdate(product: ProductUpdateInput!)`.
const PRODUCT_UPDATE = `#graphql
  mutation CitedProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation CitedMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const METAFIELD_DELETE = `#graphql
  mutation CitedMetafieldDelete($input: MetafieldIdentifierInput!) {
    metafieldsDelete(metafields: [$input]) {
      deletedMetafields { key }
      userErrors { field message }
    }
  }
`;

interface UserError {
  field?: string[] | null;
  message: string;
}

async function run(
  admin: AdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  errorPath: (data: Record<string, unknown>) => UserError[] | undefined,
) {
  const res = await admin.graphql(query, { variables });
  const body = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  const userErrors = body.data ? errorPath(body.data) : undefined;
  if (userErrors && userErrors.length > 0) {
    throw new Error(
      "Shopify rejected the write: " +
        userErrors.map((e) => e.message).join("; "),
    );
  }
}

/** Load a draft and confirm it belongs to this shop. */
async function loadOwnedDraft(shopId: string, draftId: string) {
  const draft = await prisma.enrichmentDraft.findUnique({
    where: { id: draftId },
    include: { product: true },
  });
  if (!draft || draft.product.shopId !== shopId) {
    throw new Error("Draft not found.");
  }
  return draft;
}

/** Explicit approval: DRAFT -> APPROVED. No store write happens here. */
export async function approveDraft(shopId: string, draftId: string) {
  const draft = await loadOwnedDraft(shopId, draftId);
  return prisma.enrichmentDraft.update({
    where: { id: draft.id },
    data: { status: "APPROVED" },
  });
}

/** Reject a draft: -> REJECTED. No store write. */
export async function rejectDraft(shopId: string, draftId: string) {
  const draft = await loadOwnedDraft(shopId, draftId);
  return prisma.enrichmentDraft.update({
    where: { id: draft.id },
    data: { status: "REJECTED" },
  });
}

/**
 * Apply an APPROVED draft to the store. Throws (ApprovalRequiredError) if the
 * draft is not APPROVED — this is the enforced write-back gate. On success:
 * status -> APPLIED, appliedAt set.
 */
export async function applyDraft(
  admin: AdminGraphqlClient,
  shopId: string,
  draftId: string,
) {
  const draft = await loadOwnedDraft(shopId, draftId);
  assertApproved(draft.status);

  const productGid = draft.product.shopifyGid;

  if (draft.field === "description") {
    await run(
      admin,
      PRODUCT_UPDATE,
      { product: { id: productGid, descriptionHtml: draft.aiValue } },
      (d) => (d.productUpdate as { userErrors: UserError[] }).userErrors,
    );
  } else {
    // faq / attributes -> JSON metafield under the "cited" namespace.
    await run(
      admin,
      METAFIELDS_SET,
      {
        metafields: [
          {
            ownerId: productGid,
            namespace: METAFIELD_NAMESPACE,
            key: draft.field,
            type: "json",
            value: draft.aiValue,
          },
        ],
      },
      (d) => (d.metafieldsSet as { userErrors: UserError[] }).userErrors,
    );
  }

  return prisma.enrichmentDraft.update({
    where: { id: draft.id },
    data: { status: "APPLIED", appliedAt: new Date() },
  });
}

/**
 * Roll back an APPLIED draft, restoring the exact original value.
 * Description: restore originalValue. Metafields: delete (they were new).
 */
export async function rollbackDraft(
  admin: AdminGraphqlClient,
  shopId: string,
  draftId: string,
) {
  const draft = await loadOwnedDraft(shopId, draftId);
  if (draft.status !== "APPLIED") {
    throw new Error("Only applied drafts can be rolled back.");
  }
  const productGid = draft.product.shopifyGid;

  if (draft.field === "description") {
    await run(
      admin,
      PRODUCT_UPDATE,
      {
        product: { id: productGid, descriptionHtml: draft.originalValue ?? "" },
      },
      (d) => (d.productUpdate as { userErrors: UserError[] }).userErrors,
    );
  } else {
    await run(
      admin,
      METAFIELD_DELETE,
      {
        input: {
          ownerId: productGid,
          namespace: METAFIELD_NAMESPACE,
          key: draft.field,
        },
      },
      (d) => (d.metafieldsDelete as { userErrors: UserError[] }).userErrors,
    );
  }

  return prisma.enrichmentDraft.update({
    where: { id: draft.id },
    data: { status: "REJECTED", appliedAt: null },
  });
}
