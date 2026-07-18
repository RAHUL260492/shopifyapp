// Anthropic implementation of LLMProvider (enrichment generation).
// Uses the official SDK; the SDK retries 429/5xx with backoff by default.

import Anthropic from "@anthropic-ai/sdk";

import type { LLMProvider, LlmGenerateParams, LlmResult } from "./types";
import { LlmRefusalError } from "./types";

// Always Opus 4.8 unless a caller overrides — the most capable model for
// intent-led product copy (brief §3: Anthropic for enrichment generation).
export const ENRICHMENT_MODEL = "claude-opus-4-8";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(params: LlmGenerateParams): Promise<LlmResult> {
    const res = await this.client.messages.create({
      model: ENRICHMENT_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(params.jsonSchema
        ? {
            output_config: {
              format: {
                type: "json_schema" as const,
                schema: params.jsonSchema as { [key: string]: unknown },
              },
            },
          }
        : {}),
    });

    if (res.stop_reason === "refusal") {
      throw new LlmRefusalError(
        "The model declined to generate enrichment for this product.",
        res.stop_reason,
      );
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      model: res.model,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
      stopReason: res.stop_reason,
    };
  }
}
