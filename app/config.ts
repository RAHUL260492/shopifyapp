// Single source of truth for brand + plan configuration.
// Per PROJECT_BRIEF.md: the brand name is NOT hardcoded anywhere else.
// (Working name was "Aivo"; the linked Shopify app is named "Cited".)

export const APP_NAME = "Cited";

// Plan tiers and their server-enforced limits (brief §2.2.4).
// Enforcement lands in Phase 7; defined here so UI/limits share one source.
export const PLANS = {
  STARTER: {
    tier: "STARTER",
    name: "Starter",
    priceUsd: 19,
    trackedPromptLimit: 10,
    scanCadence: "weekly",
    enrichmentWriteback: false,
    competitorShareOfVoice: false,
  },
  GROWTH: {
    tier: "GROWTH",
    name: "Growth",
    priceUsd: 49,
    trackedPromptLimit: 50,
    scanCadence: "daily",
    enrichmentWriteback: true,
    competitorShareOfVoice: true,
  },
} as const;

export const TRIAL_DAYS = 7;
