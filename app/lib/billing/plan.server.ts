// Managed Pricing plan resolution. The source of truth for a shop's plan is
// Shopify billing (billing.check); we mirror it onto Shop.planTier so the rest
// of the app can read the tier without a billing round-trip on every request.

import prisma from "../../db.server";
import { APP_HANDLE } from "../../config";
import type { PlanKey } from "../../config";

// Minimal shape of the shopify-app-remix `billing` object we depend on.
// (billing.check() returns { hasActivePayment, appSubscriptions } — Managed
// Pricing works with no args; it reports the store's active subscriptions.)
// The param is typed `unknown` at the boundary and narrowed here so callers can
// pass the SDK's generic `billing` object without variance friction.
interface BillingLike {
  check: () => Promise<{
    appSubscriptions: Array<{ name: string; status?: string }>;
  }>;
}

/** Map a Managed Pricing plan name to our PlanKey. No paid sub => FREE. */
export function planNameToKey(name?: string | null): PlanKey {
  const n = (name ?? "").toLowerCase();
  if (n.includes("pro")) return "PRO";
  if (n.includes("growth")) return "GROWTH";
  if (n.includes("starter")) return "STARTER";
  return "FREE";
}

/** Resolve the active plan from Shopify billing. Defaults to FREE on any error. */
export async function resolvePlanTier(billing: unknown): Promise<PlanKey> {
  try {
    const { appSubscriptions } = await (billing as BillingLike).check();
    const active =
      appSubscriptions.find((s) => s.status === "ACTIVE") ??
      appSubscriptions[0];
    return planNameToKey(active?.name);
  } catch {
    return "FREE";
  }
}

/** Mirror the resolved plan onto Shop.planTier (idempotent). */
export async function syncPlanTier(
  shopId: string,
  tier: PlanKey,
): Promise<void> {
  await prisma.shop.update({
    where: { id: shopId },
    data: { planTier: tier },
  });
}

/** Resolve + persist in one call; returns the effective PlanKey. */
export async function resolveAndStorePlan(
  billing: unknown,
  shopId: string,
): Promise<PlanKey> {
  const tier = await resolvePlanTier(billing);
  await syncPlanTier(shopId, tier);
  return tier;
}

/** Shopify Managed Pricing page for this store (merchant picks/changes plan). */
export function managedPricingUrl(shopDomain: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;
}
