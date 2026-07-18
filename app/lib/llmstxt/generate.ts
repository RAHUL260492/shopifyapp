// Pure llms.txt generator (spec: llmstxt.org). Produces a well-formed markdown
// index of the store's *published* catalog for AI crawlers. Deterministic and
// unit-tested — QA-6 requires no draft/archived/handle-less products leak.

export interface LlmsTxtProduct {
  title: string;
  handle: string;
  status: string; // "ACTIVE" | "DRAFT" | "ARCHIVED"
}

export interface LlmsTxtInput {
  /** Storefront host, e.g. "acme.myshopify.com" (no scheme). */
  shopDomain: string;
  shopName?: string;
  products: LlmsTxtProduct[];
}

/** Make a string safe to embed as markdown link text (no brackets/newlines). */
function linkText(s: string): string {
  return s.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

export function productUrl(shopDomain: string, handle: string): string {
  return `https://${shopDomain}/products/${handle}`;
}

/**
 * Build the llms.txt content. Only ACTIVE products with a non-empty handle are
 * listed. Output is stable (input order preserved) so served bytes are cacheable.
 */
export function generateLlmsTxt(input: LlmsTxtInput): string {
  const name = (input.shopName ?? input.shopDomain).trim() || input.shopDomain;
  const published = input.products.filter(
    (p) => p.status === "ACTIVE" && p.handle.trim() !== "",
  );

  const lines: string[] = [];
  lines.push(`# ${linkText(name)}`);
  lines.push("");
  lines.push(
    `> Product catalog for ${linkText(name)}, formatted for AI answer engines. ` +
      `${published.length} published ${published.length === 1 ? "product" : "products"}.`,
  );
  lines.push("");
  lines.push("## Products");
  lines.push("");
  for (const p of published) {
    const title = linkText(p.title) || p.handle;
    lines.push(`- [${title}](${productUrl(input.shopDomain, p.handle)})`);
  }
  // Trailing newline for a well-formed text file.
  return lines.join("\n") + "\n";
}
