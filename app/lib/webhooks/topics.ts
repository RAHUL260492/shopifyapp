// Pure helpers for comparing webhook topics. authenticate.webhook may surface a
// topic as "customers/data_request" or the enum form "CUSTOMERS_DATA_REQUEST"
// depending on version/source — normalize both to one canonical constant.

export const COMPLIANCE_TOPICS = {
  CUSTOMERS_DATA_REQUEST: "CUSTOMERS_DATA_REQUEST",
  CUSTOMERS_REDACT: "CUSTOMERS_REDACT",
  SHOP_REDACT: "SHOP_REDACT",
} as const;

export type ComplianceTopic =
  (typeof COMPLIANCE_TOPICS)[keyof typeof COMPLIANCE_TOPICS];

/** Canonicalize any topic spelling to UPPER_SNAKE (slashes/dashes -> "_"). */
export function normalizeTopic(topic: string): string {
  return topic.toUpperCase().replace(/[/-]/g, "_");
}

/** Return the ComplianceTopic this topic maps to, or null if it's not one. */
export function complianceTopic(topic: string): ComplianceTopic | null {
  const norm = normalizeTopic(topic);
  return norm in COMPLIANCE_TOPICS ? (norm as ComplianceTopic) : null;
}
