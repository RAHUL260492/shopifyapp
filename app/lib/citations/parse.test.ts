import { describe, it, expect } from "vitest";

import {
  parseCitationResponse,
  normalizeText,
  matchesExact,
  matchesFuzzy,
  editDistance,
  extractDomains,
} from "./parse";
import type { CitationParseInput } from "./parse";

const BRAND = ["Acme", "Acme Beanie"];
const COMPETITORS = [
  { name: "Globex", domain: "globex.com" },
  { name: "Initech", domain: "initech.io" },
];

function parse(response: string, over: Partial<CitationParseInput> = {}) {
  return parseCitationResponse({
    response,
    brandTerms: BRAND,
    competitors: COMPETITORS,
    ...over,
  });
}

describe("brand detection", () => {
  it("detects an exact brand mention", () => {
    const r = parse("For beanies I'd recommend Acme, they're great.");
    expect(r.brandMentioned).toBe(true);
    expect(r.productsMentioned).toContain("Acme");
  });

  it("reports brand absent when not mentioned", () => {
    const r = parse("You should look at other wool hat makers.");
    expect(r.brandMentioned).toBe(false);
    expect(r.productsMentioned).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(parse("ACME is solid").brandMentioned).toBe(true);
  });

  it("matches a possessive form (Acme's)", () => {
    expect(parse("Acme's beanies are warm").brandMentioned).toBe(true);
  });

  it("matches a plural form (Acmes)", () => {
    expect(parse("I own two Acmes").brandMentioned).toBe(true);
  });

  it("matches a multi-word product name", () => {
    const r = parse("The Acme Beanie is my favourite");
    expect(r.productsMentioned).toContain("Acme Beanie");
  });

  it("does NOT false-positive on a substring of another word", () => {
    // "Acme" must not match inside "Acmecorp"; brand "Ace" not inside "space".
    const r = parseCitationResponse({
      response: "The Acmecorp brand and some empty space here.",
      brandTerms: ["Acme", "Ace"],
      competitors: [],
    });
    expect(r.brandMentioned).toBe(false);
  });

  it("dedupes repeated brand mentions", () => {
    const r = parse("Acme, Acme, and again Acme");
    expect(r.productsMentioned).toEqual(["Acme"]);
  });
});

describe("misspellings (fuzzy → ambiguous)", () => {
  it("detects a one-character misspelling and flags it ambiguous", () => {
    const r = parse("I think Acmee makes good beanies");
    expect(r.brandMentioned).toBe(true);
    expect(r.ambiguous).toContain("Acme");
    // Fuzzy matches are not counted as exact product mentions.
    expect(r.productsMentioned).not.toContain("Acme");
  });

  it("does not fuzzy-match very different words", () => {
    const r = parse("Consider Anvil or Zenith instead");
    expect(r.brandMentioned).toBe(false);
    expect(r.ambiguous).toEqual([]);
  });
});

describe("competitor detection", () => {
  it("detects a competitor with the brand absent (competitor-only)", () => {
    const r = parse("Globex is a popular choice.");
    expect(r.brandMentioned).toBe(false);
    expect(r.competitorsMentioned).toContain("Globex");
  });

  it("detects multiple competitors", () => {
    const r = parse("Both Globex and Initech are options.");
    expect(r.competitorsMentioned).toEqual(
      expect.arrayContaining(["Globex", "Initech"]),
    );
  });

  it("matches a competitor possessive", () => {
    expect(parse("Globex's hats").competitorsMentioned).toContain("Globex");
  });

  it("detects brand and competitor together", () => {
    const r = parse("Acme beats Globex on quality.");
    expect(r.brandMentioned).toBe(true);
    expect(r.competitorsMentioned).toContain("Globex");
  });
});

describe("markdown-heavy answers", () => {
  it("sees through links, bold, and headings", () => {
    const r = parse(
      "## Top picks\n\n- **[Acme](https://acme.com)** — warm\n- _Globex_ is cheaper",
    );
    expect(r.brandMentioned).toBe(true);
    expect(r.competitorsMentioned).toContain("Globex");
  });

  it("ignores brand names inside code fences", () => {
    const r = parse("```\nAcme\n```\nHere are some neutral wool hats.");
    expect(r.brandMentioned).toBe(false);
  });
});

describe("refusals / empty", () => {
  it("marks an empty response as empty", () => {
    const r = parse("");
    expect(r.empty).toBe(true);
    expect(r.brandMentioned).toBe(false);
  });

  it("marks a refusal as empty", () => {
    expect(parse("I can't help with that request.").empty).toBe(true);
    expect(parse("I'm unable to provide recommendations.").empty).toBe(true);
  });
});

describe("cited domains", () => {
  it("extracts domains from full URLs and strips www", () => {
    const r = parse("See https://www.globex.com/hats and http://initech.io");
    expect(r.citedDomains).toEqual(
      expect.arrayContaining(["globex.com", "initech.io"]),
    );
  });

  it("extracts bare domains", () => {
    expect(extractDomains("visit acme.com for details")).toContain("acme.com");
  });

  it("does not extract a domain from an email address", () => {
    expect(extractDomains("email me@acme.com")).not.toContain("acme.com");
  });

  it("dedupes domains", () => {
    const r = extractDomains("acme.com and https://acme.com/x");
    expect(r.filter((d) => d === "acme.com")).toHaveLength(1);
  });
});

describe("primitives", () => {
  it("normalizeText strips markdown emphasis", () => {
    expect(normalizeText("**Bold** _italic_ # H")).toBe("Bold italic H");
  });

  it("matchesExact respects word boundaries", () => {
    expect(matchesExact("i am excited", "cited")).toBe(false);
    expect(matchesExact("as cited above", "cited")).toBe(true);
  });

  it("matchesFuzzy only fires on close single-word terms", () => {
    expect(matchesFuzzy("acmee rocks", "acme")).toBe(true);
    expect(matchesFuzzy("totally different", "acme")).toBe(false);
    expect(matchesFuzzy("ac me", "ac")).toBe(false); // too short
  });

  it("editDistance is correct", () => {
    expect(editDistance("acme", "acme")).toBe(0);
    expect(editDistance("acme", "acmee")).toBe(1);
    expect(editDistance("acme", "xyz")).toBeGreaterThan(1);
  });
});
