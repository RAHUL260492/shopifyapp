import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shop.server";
import { deleteProduct } from "../lib/products/sync.server";
import { productGidFromPayload } from "../lib/products/webhook.server";

// products/delete — remove the product (issues cascade).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload } =
    await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!session) return new Response();

  const gid = productGidFromPayload(payload);
  if (!gid) return new Response();

  const local = await ensureShop(shop);
  await deleteProduct(local.id, gid);
  return new Response();
};
