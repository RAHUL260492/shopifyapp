import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { syncSingleProduct } from "../lib/products/sync.server";
import { productGidFromPayload } from "../lib/products/webhook.server";

// products/create — incremental sync of a newly created product.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload, admin } =
    await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // No admin/session (e.g. post-uninstall replay) => nothing to sync.
  if (!session || !admin) return new Response();

  const gid = productGidFromPayload(payload);
  if (!gid) return new Response();

  const local = await ensureShop(shop);
  await syncSingleProduct(admin, local.id, gid);
  return new Response();
};
