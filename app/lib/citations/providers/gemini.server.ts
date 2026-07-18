// Google Gemini citation provider (with Google Search grounding).
// NOTE: verify the request/response shape against current Gemini API docs before
// the live QA-4 — written to the documented generateContent + google_search tool
// shape but not verifiable here without a key. Isolated behind CitationProvider.

import type { CitationProvider, CitationQueryResult } from "../provider";

const GEMINI_MODEL = "gemini-2.0-flash";

export class GeminiCitationProvider implements CitationProvider {
  readonly engine = "gemini";
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async query(prompt: string): Promise<CitationQueryResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    return {
      text,
      model: GEMINI_MODEL,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
