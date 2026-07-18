// Server-side tier enforcement (brief §2.2.4 / QA-7). Pure functions over the
// single PLANS config, so every limit is testable and cannot be bypassed from
// the client — routes call the assert* guards before doing gated work.

import { PLANS } from "../../config";
import type { PlanKey } from "../../config";
import { planForTier } from "../plans";

export class TierLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TierLimitError";
  }
}

/** AI enrichment write-back is Growth & Pro only. */
export function canEnrich(tier: PlanKey): boolean {
  return PLANS[tier].enrichmentWriteback;
}

export function promptLimit(tier: PlanKey): number {
  return PLANS[tier].trackedPromptLimit;
}

export function scanCadence(tier: PlanKey): "weekly" | "daily" {
  return PLANS[tier].scanCadence;
}

export function competitorLimit(tier: PlanKey): number {
  return PLANS[tier].competitorLimit;
}

/** Throws unless the plan includes AI enrichment write-back. */
export function assertCanEnrich(tier: PlanKey): void {
  if (!canEnrich(tier)) {
    const plan = planForTier(tier);
    throw new TierLimitError(
      `AI enrichment is available on the Growth and Pro plans. ` +
        `Your current plan${plan ? ` (${plan.name})` : ""} does not include it.`,
    );
  }
}

/** Throws when adding one more tracked prompt would exceed the tier limit. */
export function assertWithinPromptLimit(
  tier: PlanKey,
  currentCount: number,
): void {
  const limit = promptLimit(tier);
  if (currentCount >= limit) {
    throw new TierLimitError(
      `Your plan allows up to ${limit} tracked prompts. Upgrade to add more.`,
    );
  }
}

/** Throws when adding one more competitor would exceed the tier limit. */
export function assertWithinCompetitorLimit(
  tier: PlanKey,
  currentCount: number,
): void {
  const limit = competitorLimit(tier);
  if (currentCount >= limit) {
    throw new TierLimitError(
      limit === 0
        ? "Competitor tracking is available on paid plans."
        : `Your plan allows up to ${limit} competitors. Upgrade to add more.`,
    );
  }
}
