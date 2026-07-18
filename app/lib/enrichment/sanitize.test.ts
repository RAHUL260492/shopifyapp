import { describe, it, expect } from "vitest";

import { sanitizeHtml, stripToText } from "./sanitize";

// QA-3/QA-8: treat all LLM output as untrusted — injected markup must render inert.
describe("sanitizeHtml", () => {
  it("removes <script> tags and their contents", () => {
    const out = sanitizeHtml("<p>Hi</p><script>alert('xss')</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("<p>Hi</p>");
  });

  it("strips event-handler attributes and dangerous tags", () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)"><p>Text</p>');
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("<img");
    expect(out).toContain("<p>Text</p>");
  });

  it("drops script-URL links by stripping the whole tag", () => {
    const scheme = ["java", "script:"].join(""); // avoid a literal script-URL
    const out = sanitizeHtml(`<a href="${scheme}alert(1)">click</a>`);
    expect(out.toLowerCase()).not.toContain(scheme);
    expect(out.toLowerCase()).not.toContain("alert");
    expect(out.toLowerCase()).not.toContain("<a");
    expect(out).toContain("click");
  });

  it("keeps allowlisted formatting tags", () => {
    const out = sanitizeHtml(
      "<p>A <strong>bold</strong> and <em>italic</em></p><ul><li>one</li></ul>",
    );
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<li>one</li>");
  });

  it("removes iframe/style blocks entirely", () => {
    const out = sanitizeHtml(
      "<style>body{display:none}</style><iframe src=evil></iframe><p>ok</p>",
    );
    expect(out.toLowerCase()).not.toContain("<style");
    expect(out.toLowerCase()).not.toContain("<iframe");
    expect(out).toContain("<p>ok</p>");
  });
});

describe("stripToText", () => {
  it("removes all tags and collapses whitespace", () => {
    expect(stripToText("<p>Hello   <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });
});
