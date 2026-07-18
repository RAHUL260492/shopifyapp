import { describe, it, expect } from "vitest";

import { auditRobotsTxt, isBlocked, parseRobots } from "./audit";

describe("auditRobotsTxt", () => {
  it("flags a crawler blocked by an exact user-agent group", () => {
    const robots = "User-agent: GPTBot\nDisallow: /\n";
    const results = auditRobotsTxt(robots);
    const gptbot = results.find((r) => r.userAgent === "GPTBot");
    expect(gptbot?.blocked).toBe(true);
    // Others without a rule are not blocked.
    const claude = results.find((r) => r.userAgent === "ClaudeBot");
    expect(claude?.blocked).toBe(false);
  });

  it("flags crawlers blocked via the wildcard group", () => {
    const robots = "User-agent: *\nDisallow: /\n";
    const results = auditRobotsTxt(robots);
    expect(results.every((r) => r.blocked)).toBe(true);
  });

  it("treats a permissive robots.txt as not blocked", () => {
    const robots = "User-agent: *\nDisallow: /checkout\nAllow: /\n";
    const results = auditRobotsTxt(robots);
    expect(results.every((r) => r.blocked)).toBe(false);
  });

  it("prefers an exact group over the wildcard group", () => {
    // Wildcard blocks everything, but ClaudeBot is explicitly allowed.
    const robots =
      "User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow:\n";
    const results = auditRobotsTxt(robots);
    const claude = results.find((r) => r.userAgent === "ClaudeBot");
    const gptbot = results.find((r) => r.userAgent === "GPTBot");
    expect(claude?.blocked).toBe(false); // exact group has no Disallow: /
    expect(gptbot?.blocked).toBe(true); // falls back to wildcard
  });
});

describe("parseRobots + isBlocked", () => {
  it("groups multiple user-agents that share rules", () => {
    const groups = parseRobots(
      "User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n",
    );
    expect(isBlocked(groups, "GPTBot")).toBe(true);
    expect(isBlocked(groups, "ClaudeBot")).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const groups = parseRobots(
      "# comment\n\nUser-agent: GPTBot   # inline\nDisallow: /\n",
    );
    expect(isBlocked(groups, "GPTBot")).toBe(true);
  });
});
