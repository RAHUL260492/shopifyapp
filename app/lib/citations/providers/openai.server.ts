// OpenAI citation provider (ChatGPT with web search). Uses the Responses API.
// NOTE: verify the request/response shape against current OpenAI docs before
// the live QA-4 — this is written to the documented Responses API but cannot be
// verified here without a key. Isolated behind CitationProvider so any shape fix
// stays in this file.

import type { CitationProvider, CitationQueryResult } from "../provider";

const OPENAI_MODEL = "gpt-4o";

export class OpenAiCitationProvider implements CitationProvider {
  readonly engine = "openai";
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async query(prompt: string): Promise<CitationQueryResult> {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        tools: [{ type: "web_search_preview" }],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text =
      data.output_text ??
      data.output
        ?.flatMap((o) => o.content ?? [])
        .map((c) => c.text ?? "")
        .join("") ??
      "";
    return {
      text,
      model: data.model ?? OPENAI_MODEL,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}
