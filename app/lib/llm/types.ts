// Provider-agnostic LLM adapter interface (brief §3: single LLMProvider behind
// which each provider — Anthropic for enrichment, later OpenAI/Gemini — lives,
// with retries/backoff and per-call cost logging handled by the caller).

export interface LlmMessage {
  role: "user";
  content: string;
}

export interface LlmGenerateParams {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  /** JSON Schema to constrain the response to structured JSON. */
  jsonSchema?: object;
}

export interface LlmUsageTokens {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  /** Raw text output. When jsonSchema is set this is a JSON string. */
  text: string;
  model: string;
  usage: LlmUsageTokens;
  /** null, "end_turn", "max_tokens", "refusal", ... */
  stopReason: string | null;
}

export interface LLMProvider {
  /** Stable provider key stored in LlmUsage.provider (e.g. "anthropic"). */
  readonly name: string;
  generate(params: LlmGenerateParams): Promise<LlmResult>;
}

/** Thrown when the model declined the request (safety refusal or empty output). */
export class LlmRefusalError extends Error {
  constructor(
    message: string,
    readonly stopReason: string | null,
  ) {
    super(message);
    this.name = "LlmRefusalError";
  }
}
