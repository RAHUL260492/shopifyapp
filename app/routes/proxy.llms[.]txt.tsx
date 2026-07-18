import type { LoaderFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../lib/shop.server";
import { generateLlmsTxt } from "../lib/llmstxt/generate";

// Public app-proxy route. Storefront path (per shopify.app.toml [app_proxy]):
//   https://{shop}/apps/cited/llms.txt  ->  {app}/proxy/llms.txt
// Served live from the synced catalog, so it's always ≤ current (satisfies the
// QA-6 "refresh within 24h of catalog change" gate without a separate job).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const shop = await ensureShop(session.shop);
  const products = await prisma.product.findMany({
    where: { shopId: shop.id },
    select: { title: true, handle: true, status: true },
    orderBy: { title: "asc" },
  });

  const body = generateLlmsTxt({ shopDomain: session.shop, products });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
