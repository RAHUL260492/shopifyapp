# PROGRESS — Aivo (AI Search Visibility Suite for Shopify)

Running log of what was built, QA status, open issues, decisions, and assumptions.
Newest entries at the top of each section.

---

## Phase status

| Phase | Name | Status | QA gate |
|-------|------|--------|---------|
| 0 | Alignment (no code) | PASSED | QA-0 ✅ (scope restated, ambiguities resolved by Rahul) |
| 1 | Scaffold & Auth | BUILT — QA-1 PARTIAL | QA-1: local items PASS; dev-store install items BLOCKED (no dev store yet) |
| 2 | Catalog Sync & Readiness Engine | not started | — |
| 3 | AI Enrichment Flow | not started | — |
| 4 | Citation Tracking Engine | not started | — |
| 5 | Visibility Dashboard | not started | — |
| 6 | llms.txt / JSON-LD / robots | not started | — |
| 7 | Billing & Tier Enforcement | not started | — |
| 8 | Hardening & Compliance | not started | — |
| 9 | Beta on Real Stores | not started | — |
| 10 | App Store Submission Prep | not started | — |

---

## Session log

### 2026-07-05 — Phase 0 kickoff
- Repo initialized (`git init`), `PROJECT_BRIEF.md` saved verbatim, `PROGRESS.md` created.
- Read brief in full. Produced Phase 0 deliverables: scope restatement, open questions/ambiguities, manual setup checklist, and flagged stack/requirement concerns to verify against shopify.dev before Phase 1.
- No code written (correct for Phase 0 / QA-0).
- **Blocking on Rahul:** answers to the open-questions list below before Phase 1 can start.

### 2026-07-05 — Phase 1 scaffold & auth
**Built:**
- Scaffolded from official `Shopify/shopify-app-template-remix` (Remix 2.16, Polaris 12, `shopify-app-remix` 4.2, App Bridge 4, Prisma session storage). Token-exchange embedded auth (`unstable_newEmbeddedAuthStrategy`) — matches locked decision.
- **Prisma schema v1** rewritten for **PostgreSQL** + full §3.1 data model (Shop, Product, ProductIssue, EnrichmentDraft, TrackedPrompt, Competitor, ScanRun, ScanResult, LlmUsage, WebhookLog, BillingRecord) + required Session model. `prisma validate` passes.
- **Embedded Polaris shell** with nav stubs: Overview (`app._index`), Products, Prompts & Citations, Settings. Each is an authenticated route with a placeholder card.
- **`/healthz`** public route — pings DB, 200/503.
- **Brand constant** in `app/config.ts` (`APP_NAME = "Aivo"`, plus PLANS/TRIAL_DAYS single-source config).
- First tested pure module: `app/lib/plans.ts` + `plans.test.ts` (7 tests) — plan/tier lookups used by Phase 7 enforcement.
- **Vitest** wired (`vitest.config.ts`, coverage scoped to `app/lib/**`). **CI** workflow (`.github/workflows/ci.yml`): npm ci → prisma generate → typecheck → lint → test on Node 22.
- **`.env.example`** documents every variable.
- Scopes set to minimum-necessary `read_products,write_products` (rest added per phase).

**Fixes made during build:**
- Dependency drift: `shopify-app-remix`(→shopify-api 13) vs `shopify-app-session-storage-prisma`(→shopify-api 12) caused a `Session` type mismatch. Fixed by pinning `@shopify/shopify-api": "13.1.0"` in overrides/resolutions; deduped to a single version. (P1 — fixed.)
- Removed template's `@remix-run/eslint-config/jest-testing-library` ESLint preset (we use Vitest, not Jest — it crashed lint trying to detect a Jest version).

**Removed template cruft:** Shopify-org meta files (CODEOWNERS, CODE_OF_CONDUCT, CONTRIBUTING, ISSUE/PR templates), Shopify-repo automation workflows, template CHANGELOG, demo `app.additional` route, and the SQLite session migration.

**QA-1 report (PASS/FAIL per item):**
| Item | Status | Note |
|------|--------|------|
| TypeScript strict passes | ✅ PASS | `tsc --noEmit` clean |
| ESLint clean | ✅ PASS | exit 0 (deprecation warning only — see P3) |
| Tests green | ✅ PASS | 7/7 (`plans.test.ts`) |
| App builds | ✅ PASS | `remix vite:build` OK (Polaris CSS warning cosmetic) |
| `.env.example` complete | ✅ PASS | all vars documented |
| No secrets in repo (secret scan) | ✅ PASS | no `.env` tracked; regex scan for sk-/shpat_/AIza/private-keys clean |
| CI configured & locally green | ✅ PASS (config) | GH Actions runs same steps; actual run happens on push |
| Fresh install OAuth <10s on dev store | ⛔ BLOCKED | needs a dev store (not yet created) |
| Embedded load, no console errors | ⛔ BLOCKED | needs install |
| Reinstall after uninstall works | ⛔ BLOCKED | needs install |
| Session persists across reload | ⛔ BLOCKED | needs install |

→ **QA-1 cannot fully close until Rahul provides a dev store** (+ links the Partner app via `shopify app config link`, sets env, `prisma migrate dev` against a Postgres DB). All code-level gate items pass.

**Open issues:**
- P3: `@remix-run/eslint-config` is deprecated (inherited from template). Migrate to flat config later — non-blocking.
- Deferred to Phase 8 (QA-8): `npm audit` reports 32 vulns (6 moderate/26 high) from inherited template deps.

---

## Decisions & assumptions (locked 2026-07-05)
- **Auth:** template default — session-token / token-exchange (not classic OAuth redirect).
- **Sentry:** skipped for v1; pino structured logs + `/healthz` only.
- **Reviews source:** deferred to Phase 2; readiness engine treats reviews as a generic metafield lookup, review-app adapter finalized in Phase 2.
- **Hosting:** Railway (app + Postgres + Redis) as per brief — no deviation.
- **Setup status (Rahul):** Partner app CREATED. Dev store, Railway, and LLM keys NOT yet done.
  - ⚠️ **QA-1 gate is partially BLOCKED**: OAuth install test on a dev store cannot run until a dev store with seed products exists. Phase 1 code will be built and locally verified; the "fresh install on dev store <10s" item stays PENDING until the store is provided.
- **Brand constant:** "Aivo" retained as the single config constant.

## Open issues / bugs
- (none — no code yet)

## Flags: brief vs. current Shopify requirements (to verify live at Phase 1)
- **Billing:** brief specifies Billing API recurring charges. Shopify now steers new apps toward **Managed Pricing**. Must confirm which is required/allowed before Phase 7 design — pull live from shopify.dev.
- **Auth:** brief says "OAuth install flow." Current Remix template default is **session-token / token-exchange** auth. Will use the template default unless Rahul wants classic OAuth.
- **Scopes:** brief lists `read_content` and `read_online_store_pages`; these overlap/have changed names across API versions. Verify exact current scope names before requesting them (fewer scopes = easier review).
- **robots.txt:** confirmed constraint — Shopify only allows edits via `robots.txt.liquid`; app can instruct, not force. Brief already accounts for this.

## v2 backlog (do not build)
Perplexity/Claude tracking engines · agency multi-store dashboard · auto-published citation-target content · off-site mention monitoring · OpenAI merchant feed export · Klaviyo/review-app integrations · white-label reports for agencies.
