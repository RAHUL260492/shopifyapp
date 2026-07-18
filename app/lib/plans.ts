import { PLANS } from "../config";

// Mirrors the Prisma PlanTier enum. NONE = pre-selection (freshly installed,
// no plan chosen yet); FREE is a real, selectable $0 tier.
export type Tier = "NONE" | "FREE" | "STARTER" | "GROWTH" | "PRO";
export type PlanConfig = (typeof PLANS)[keyof typeof PLANS];

// Pure lookup of the plan config for a tier. NONE (no plan chosen) => null.
// Tier enforcement in Phase 7 builds on this single source.
export function planForTier(tier: Tier): PlanConfig | null {
  if (tier === "FREE") return PLANS.FREE;
  if (tier === "STARTER") return PLANS.STARTER;
  if (tier === "GROWTH") return PLANS.GROWTH;
  if (tier === "PRO") return PLANS.PRO;
  return null;
}

// Whether a tier is allowed to use AI enrichment write-back (Growth & Pro).
export function canUseEnrichment(tier: Tier): boolean {
  return planForTier(tier)?.enrichmentWriteback ?? false;
}

// Max number of tracked prompts allowed for a tier (0 when no subscription).
export function trackedPromptLimit(tier: Tier): number {
  return planForTier(tier)?.trackedPromptLimit ?? 0;
}
