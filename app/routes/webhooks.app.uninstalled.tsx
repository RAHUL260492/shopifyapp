import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Purge access tokens immediately (brief QA-8). Catalog/enrichment data is
    // retained until shop/redact (30-day window per the billing decision).
    await db.session.deleteMany({ where: { shop } });
    await db.shop.updateMany({
      where: { domain: shop },
      data: { uninstalledAt: new Date() },
    });
  }

  return new Response();
};
