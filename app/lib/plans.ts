import { PLANS } from "../config";

export type Tier = "NONE" | "STARTER" | "GROWTH";
export type PlanConfig = (typeof PLANS)[keyof typeof PLANS];

// Pure lookup of the plan config for a tier. NONE (no subscription) => null.
// Tier enforcement in Phase 7 builds on this single source.
export function planForTier(tier: Tier): PlanConfig | null {
  if (tier === "STARTER") return PLANS.STARTER;
  if (tier === "GROWTH") return PLANS.GROWTH;
  return null;
}

// Whether a tier is allowed to use AI enrichment write-back (Growth only).
export function canUseEnrichment(tier: Tier): boolean {
  return planForTier(tier)?.enrichmentWriteback ?? false;
}

// Max number of tracked prompts allowed for a tier (0 when no subscription).
export function trackedPromptLimit(tier: Tier): number {
  return planForTier(tier)?.trackedPromptLimit ?? 0;
}
