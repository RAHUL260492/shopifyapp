// Single source of truth for brand + plan configuration.
// Per PROJECT_BRIEF.md: the brand name is NOT hardcoded anywhere else.
// (Working name was "Aivo"; the linked Shopify app is named "Cited".)

export const APP_NAME = "Cited";

// The app's handle in the Partner Dashboard — used to build the Shopify
// Managed Pricing URL (admin.shopify.com/store/<store>/charges/<APP_HANDLE>/pricing_plans).
// NOTE: verify this matches the app handle in the Partner Dashboard before the
// live billing QA (Phase 7). Overridable via env for different environments.
export const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "cited";

// Plan tiers and their server-enforced limits (brief §2.2.4, extended to 4 tiers).
// Enforcement lands in Phase 7; defined here so UI/limits share one source.
// `scanCadence` is the citation-scan frequency; `competitorLimit` caps
// share-of-voice competitors. Keep this object the ONLY place limits live.
export const PLANS = {
  FREE: {
    tier: "FREE",
    name: "Free",
    priceUsd: 0,
    trackedPromptLimit: 3,
    scanCadence: "weekly",
    enrichmentWriteback: false,
    competitorShareOfVoice: false,
    competitorLimit: 0,
  },
  STARTER: {
    tier: "STARTER",
    name: "Starter",
    priceUsd: 19,
    trackedPromptLimit: 10,
    scanCadence: "weekly",
    enrichmentWriteback: false,
    competitorShareOfVoice: false,
    competitorLimit: 1,
  },
  GROWTH: {
    tier: "GROWTH",
    name: "Growth",
    priceUsd: 49,
    trackedPromptLimit: 50,
    scanCadence: "daily",
    enrichmentWriteback: true,
    competitorShareOfVoice: true,
    competitorLimit: 3,
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    priceUsd: 99,
    trackedPromptLimit: 200,
    scanCadence: "daily",
    enrichmentWriteback: true,
    competitorShareOfVoice: true,
    competitorLimit: 10,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/** Plans shown as upgrade options, in display order (excludes Free default). */
export const PAID_PLAN_ORDER: PlanKey[] = ["STARTER", "GROWTH", "PRO"];

export const TRIAL_DAYS = 7;
