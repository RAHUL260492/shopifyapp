// Provider-agnostic citation-engine interface. Adding a new engine is a config
// + adapter change (brief §2.3), exactly like the enrichment LLMProvider.

export interface CitationQueryResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface CitationProvider {
  /** Stored on ScanRun.engine / LlmUsage.provider, e.g. "openai" | "gemini". */
  readonly engine: string;
  query(prompt: string): Promise<CitationQueryResult>;
}
