import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Pure business logic must stay 100% covered (brief QA Level 1).
      // Scoring rules, parsers, tier limits, and adapters live under app/lib.
      include: ["app/lib/**/*.ts"],
      exclude: ["app/lib/**/*.test.ts"],
    },
  },
});
