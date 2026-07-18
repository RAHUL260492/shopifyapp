// Citation provider factory. Returns the configured real engines, or the mock
// engine when no keys are set so scans still work end-to-end in development.

import type { CitationProvider } from "./provider";
import { MockCitationProvider } from "./providers/mock";
import { OpenAiCitationProvider } from "./providers/openai.server";
import { GeminiCitationProvider } from "./providers/gemini.server";

export function getCitationProviders(): CitationProvider[] {
  const providers: CitationProvider[] = [];
  if (process.env.OPENAI_API_KEY) {
    providers.push(new OpenAiCitationProvider(process.env.OPENAI_API_KEY));
  }
  if (process.env.GOOGLE_AI_API_KEY) {
    providers.push(new GeminiCitationProvider(process.env.GOOGLE_AI_API_KEY));
  }
  if (providers.length === 0) {
    providers.push(new MockCitationProvider());
  }
  return providers;
}

export function citationEnginesConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}
