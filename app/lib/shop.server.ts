// Shop provisioning. Every authenticated request maps a Shopify domain to our
// local Shop row (the FK parent for products, prompts, billing, etc.).

import prisma from "../db.server";

/**
 * Ensure a Shop row exists for this domain and return it. Idempotent: safe to
 * call on every authenticated load. Does not overwrite plan/settings on repeat.
 */
export async function ensureShop(domain: string) {
  return prisma.shop.upsert({
    where: { domain },
    update: {},
    create: { domain },
  });
}
