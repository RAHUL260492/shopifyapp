import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { complianceTopic, COMPLIANCE_TOPICS } from "../lib/webhooks/topics";
import { processWebhookOnce } from "../lib/webhooks/process.server";

// Mandatory GDPR / privacy webhooks (customers/data_request, customers/redact,
// shop/redact). authenticate.webhook verifies the HMAC and throws a 401 on a
// tampered payload, so signature enforcement is automatic here.
//
// Data model note: Cited stores NO customer PII — only shop-scoped catalog,
// enrichment, prompt, and scan data. So customer requests have nothing to
// return/delete; shop/redact purges everything for the shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, webhookId } = await authenticate.webhook(request);

  const compliance = complianceTopic(topic);
  if (!compliance) {
    // Not a compliance topic on this endpoint — acknowledge and ignore.
    return new Response();
  }

  const shouldProcess = await processWebhookOnce(topic, shop, webhookId);
  if (!shouldProcess) {
    console.log(`Duplicate ${topic} for ${shop} — skipped`);
    return new Response();
  }

  switch (compliance) {
    case COMPLIANCE_TOPICS.CUSTOMERS_DATA_REQUEST:
      // No customer PII stored — nothing to return to the merchant.
      console.log(`customers/data_request for ${shop}: no customer data stored`);
      break;

    case COMPLIANCE_TOPICS.CUSTOMERS_REDACT:
      // No customer PII stored — nothing to delete.
      console.log(`customers/redact for ${shop}: no customer data stored`);
      break;

    case COMPLIANCE_TOPICS.SHOP_REDACT:
      // Erase all data for this shop (cascades to products, drafts, prompts,
      // scans, usage, billing) plus any residual sessions.
      await prisma.shop.deleteMany({ where: { domain: shop } });
      await prisma.session.deleteMany({ where: { shop } });
      console.log(`shop/redact for ${shop}: all shop data erased`);
      break;
  }

  return new Response();
};
