// Provider factory. Returns the configured provider, or null when no key is
// set so callers can surface a clear "not configured" message instead of
// crashing (the enrichment UI stays disabled until ANTHROPIC_API_KEY exists).

import { AnthropicProvider } from "./anthropic.server";
import type { LLMProvider } from "./types";

export function getEnrichmentProvider(): LLMProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new AnthropicProvider(key);
}

export function isEnrichmentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
