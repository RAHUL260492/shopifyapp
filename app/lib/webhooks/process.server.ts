// Webhook idempotency. Shopify retries deliveries; each carries a stable
// X-Shopify-Webhook-Id (returned by authenticate.webhook as `webhookId`). We
// record it in WebhookLog and skip re-processing so handlers are idempotent
// (replay the same webhook twice → no double-processing).

import prisma from "../../db.server";

/**
 * Returns true if this delivery has not been processed before (caller should
 * process it), false if it's a duplicate. Records the delivery on first sight.
 * If webhookId is missing, always returns true (best effort — don't drop work).
 */
export async function processWebhookOnce(
  topic: string,
  shopDomain: string,
  webhookId: string | undefined | null,
): Promise<boolean> {
  if (!webhookId) return true;

  const existing = await prisma.webhookLog.findFirst({
    where: { shopDomain, topic, payloadHash: webhookId },
  });
  if (existing) return false;

  await prisma.webhookLog.create({
    data: {
      shopDomain,
      topic,
      payloadHash: webhookId,
      processedAt: new Date(),
    },
  });
  return true;
}
