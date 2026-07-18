import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { syncSingleProduct } from "../lib/products/sync.server";
import { productGidFromPayload } from "../lib/products/webhook.server";

// products/update — re-fetch and re-score the changed product.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload, admin } =
    await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!session || !admin) return new Response();

  const gid = productGidFromPayload(payload);
  if (!gid) return new Response();

  const local = await ensureShop(shop);
  await syncSingleProduct(admin, local.id, gid);
  return new Response();
};
