// Pure robots.txt auditor: detect which AI answer-engine crawlers are blocked,
// and produce a copy-paste robots.txt.liquid fix. Shopify only allows robots
// edits via robots.txt.liquid — we instruct, we can't force (brief §2.3/§6).

export interface AiCrawler {
  /** Human label shown in the UI. */
  name: string;
  /** robots.txt User-agent token. */
  userAgent: string;
}

// The engines that matter for AI search visibility (brief §2.2.3).
export const AI_CRAWLERS: AiCrawler[] = [
  { name: "ChatGPT — search", userAgent: "OAI-SearchBot" },
  { name: "ChatGPT — training (GPTBot)", userAgent: "GPTBot" },
  { name: "Perplexity", userAgent: "PerplexityBot" },
  { name: "Google AI (Gemini / AI Overviews)", userAgent: "Google-Extended" },
  { name: "Claude", userAgent: "ClaudeBot" },
  { name: "Apple Intelligence", userAgent: "Applebot-Extended" },
];

export interface CrawlerAuditResult extends AiCrawler {
  blocked: boolean;
}

interface RobotsGroup {
  agents: string[]; // lowercased user-agent tokens
  disallows: string[];
}

/** Parse robots.txt into user-agent groups (lowercased agents + disallow paths). */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !expectingAgents) {
        current = { agents: [], disallows: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "disallow") {
      if (current) {
        current.disallows.push(value);
        expectingAgents = false;
      }
    } else {
      // allow / crawl-delay / sitemap / etc. — end the agent list for this group
      expectingAgents = false;
    }
  }
  return groups;
}

/** True if `userAgent` is disallowed from the site root. */
export function isBlocked(groups: RobotsGroup[], userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const disallowsRoot = (g: RobotsGroup) => g.disallows.includes("/");

  const exact = groups.filter((g) => g.agents.includes(ua));
  if (exact.length > 0) return exact.some(disallowsRoot);

  const wildcard = groups.filter((g) => g.agents.includes("*"));
  return wildcard.some(disallowsRoot);
}

/** Audit each AI crawler against a robots.txt body. */
export function auditRobotsTxt(text: string): CrawlerAuditResult[] {
  const groups = parseRobots(text);
  return AI_CRAWLERS.map((c) => ({
    ...c,
    blocked: isBlocked(groups, c.userAgent),
  }));
}

/**
 * Copy-paste robots.txt.liquid fix: renders Shopify's default groups, then
 * appends explicit Allow groups for the given crawlers so they can crawl.
 * The merchant pastes this into templates/robots.txt.liquid.
 */
export function buildRobotsFixLiquid(crawlers: AiCrawler[]): string {
  const allowBlocks = crawlers
    .map(
      (c) =>
        `User-agent: ${c.userAgent}\nAllow: /`,
    )
    .join("\n\n");

  return [
    "{% for group in robots.default_groups %}",
    "  {{ group.user_agent }}",
    "  {% for rule in group.rules %}{{ rule }}",
    "  {% endfor %}",
    "  {% if group.sitemap %}{{ group.sitemap }}{% endif %}",
    "{% endfor %}",
    "",
    "# Allow AI answer engines to crawl (added by Cited)",
    allowBlocks,
    "",
  ].join("\n");
}
