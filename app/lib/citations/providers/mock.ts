// Mock citation provider — used when no engine API keys are configured, so the
// scan flow and UI work end-to-end in development. Returns a deterministic
// canned answer (no randomness — pure of clock/RNG) that varies by prompt.

import type { CitationProvider, CitationQueryResult } from "../provider";

export class MockCitationProvider implements CitationProvider {
  readonly engine = "mock";

  async query(prompt: string): Promise<CitationQueryResult> {
    const text =
      `Based on general knowledge, popular options for "${prompt}" include ` +
      `a few well-known brands. This is placeholder output from the mock ` +
      `engine — connect OpenAI and Google Gemini API keys to run real scans.`;
    return {
      text,
      model: "mock-1",
      usage: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
    };
  }
}
