# PROGRESS — Aivo (AI Search Visibility Suite for Shopify)

Running log of what was built, QA status, open issues, decisions, and assumptions.
Newest entries at the top of each section.

---

## Phase status

| Phase | Name | Status | QA gate |
|-------|------|--------|---------|
| 0 | Alignment (no code) | PASSED | QA-0 ✅ (scope restated, ambiguities resolved by Rahul) |
| 1 | Scaffold & Auth | PASSED* | QA-1 ✅ install/embedded/healthz verified; reload+reinstall pending human confirm |
| 2 | Catalog Sync & Readiness Engine | CODE COMPLETE | sync+UI+webhooks built & locally green; live QA-2 pending human run |
| 3 | AI Enrichment Flow | CODE COMPLETE | adapter+generate+approve/write-back/rollback built; safety logic tested; live QA-3 pending key+store |
| 4 | Citation Tracking Engine | CODE COMPLETE | parser+providers+scan+CRUD/UI built; runs on mock engine; live on OpenAI/Gemini keys. Scheduler (BullMQ) deferred |
| 5 | Visibility Dashboard | not started | — |
| 6 | llms.txt / JSON-LD / robots | CODE COMPLETE | generator+proxy, robots audit, JSON-LD theme extension built; live QA-6 pending deploy |
| 7 | Billing & Tier Enforcement | CODE COMPLETE | Managed Pricing: plan resolution + server-side enforcement built; live QA-7 pends Partner Dashboard plans |
| 8 | Hardening & Compliance | MOSTLY COMPLETE | GDPR webhooks + idempotency + uninstall cleanup built; 0 critical vulns; live QA-8 + dep cleanup pending |
| 9 | Beta on Real Stores | not started | — |
| 10 | App Store Submission Prep | not started | — |

---

## Session log

### 2026-07-18 — Phase 4 citation tracking engine (built against mocks; live on keys)
Built with the LLMProvider-style adapter pattern so it runs on a mock engine now (no keys) and live the moment OpenAI/Gemini keys are added. Rahul will provide keys later.

**Built:**
- **Response parser** (`app/lib/citations/parse.ts`, pure, **26 fixture tests**): brand/product/competitor mention detection with word-boundary matching (substring-safe — "Cited" ≠ "excited"), possessive/plural tolerance, light fuzzy (edit-distance ≤1) misspelling detection surfaced as `ambiguous`, markdown normalization (links/bold/code fences), refusal/empty detection, and cited-domain extraction (URLs + bare domains, www-stripped, email-safe). Covers the QA-4 fixture list.
- **Provider layer**: `CitationProvider` interface + `MockCitationProvider` (deterministic, keyless) + `OpenAiCitationProvider` (Responses API + web_search) + `GeminiCitationProvider` (generateContent + google_search grounding). Factory (`index.server.ts`) returns configured engines or falls back to mock. **Flagged:** verify OpenAI/Gemini request/response shapes against current docs before live QA-4 (isolated per adapter).
- **Cost cap** (`cost.ts`, pure, tested): per-model pricing + `wouldExceedCap`; default $2/day/shop hard cap. **Aggregation** (`aggregate.ts`, pure, tested): 3-sample smoothing → brand visibility %, competitor union, cited-domain union; `shareOfVoice` split brand vs competitors.
- **Scan orchestration** (`scan.server.ts`): per engine, run each prompt 3× → parse → persist ScanRun/ScanResult → log LlmUsage (purpose "citation_scan") → enforce daily cap (hard stop + alert log). Engine failures isolated (OpenAI down ≠ Gemini blocked). `runAllScans(shop)` + `brandTermsFor` (aliases or domain fallback).
- **Prompts & Citations UI** (`app.prompts.tsx`): tier-limited prompt CRUD + competitor CRUD (server-side `assertWithinPromptLimit`/`assertWithinCompetitorLimit` — enforced against direct calls), brand-alias config (Shop.settings), "Run scan now", and per-prompt results (brand visibility %, competitors, cited domains, last-scanned + "AI answers vary" disclosure). Mock-engine banner when no keys.

**QA (Level 1):** typecheck ✅ · lint ✅ (deprecation only) · tests **132/132** ✅ (+36: parser 26, cost/aggregate 10) · build ✅.

**Remaining:** (a) **Scheduled scans** — currently manual "Run scan now"; brief specifies BullMQ daily(Growth/Pro)/weekly(Starter) via Redis (`REDIS_URL` set). Needs a worker process; deferred (manual trigger works today). (b) **Live QA-4** — add `OPENAI_API_KEY`+`GOOGLE_AI_API_KEY`, verify adapter shapes, then run the parser suite against real answers, cap test at $0.01, engine-isolation test. (c) **Phase 5 dashboard** — Overview visibility score/30-day trends + citation-gap report (domains cited where brand absent) not yet built; per-prompt results live on the Prompts page.

### 2026-07-18 — Phase 8 GDPR compliance webhooks + hardening
**Built:**
- **Mandatory GDPR webhooks** (`app/routes/webhooks.compliance.tsx`, registered via `compliance_topics` in `shopify.app.toml`): one endpoint handling `customers/data_request`, `customers/redact`, `shop/redact`. Cited stores **no customer PII** (only shop-scoped catalog/enrichment/prompt/scan data), so customer requests have nothing to return/delete; `shop/redact` deletes the Shop (cascades to all child data) + residual sessions.
- **HMAC verification** is automatic — `authenticate.webhook` verifies the signature and throws 401 on a tampered payload, on every webhook topic (QA-8: bad HMAC rejected).
- **Idempotency** (`process.server.ts` + pure `topics.ts`, 4 tests): dedupe by Shopify's `X-Shopify-Webhook-Id` recorded in `WebhookLog` — replaying a webhook twice is a no-op. `normalizeTopic`/`complianceTopic` canonicalize slash vs enum topic spellings.
- **Uninstall cleanup** enhanced: `app/uninstalled` purges access tokens (sessions) immediately and stamps `Shop.uninstalledAt`; catalog data retained until `shop/redact` (30-day window per the billing decision).

**Security pass (already satisfied by earlier phases):** session-token auth on every `app.*` route (`authenticate.admin`); secrets server-only (`.server` modules + env, never in the client bundle); SQL-injection-safe (Prisma parameterized); LLM output treated as untrusted + sanitized/escaped (Phase 3); Admin API throttle-aware retry (Phase 2). Sentry intentionally skipped for v1 (pino + `/healthz`).

**QA (Level 1):** typecheck ✅ · lint ✅ (deprecation only) · tests **99/99** ✅ · build ✅. `npm audit`: **0 critical** (QA-8 bar met); 37 high / 6 moderate remain from inherited template deps — batch cleanup deferred (non-blocking).

**Remaining to close QA-8 (needs live store):** trigger each GDPR webhook and verify DB state (shop/redact actually erases; verify with a tampered payload → 401); confirm uninstall purges tokens; simulate Admin 429s; 5k-product load sanity check. Dependency high/moderate cleanup (`npm audit`) before submission.

### 2026-07-18 — Phase 7 billing via Shopify Managed Pricing + server-side tier enforcement
**Decision:** Rahul asked about Razorpay for billing — flagged as a Shopify App Store violation (app charges to merchants MUST go through Shopify billing; external payment gets the app rejected). Chose **Managed Pricing** (Shopify hosts the plan-selection/checkout/trial/cancellation; we resolve the active plan + enforce limits). This resolves the Phase-0 open question (Billing API vs Managed Pricing) in favor of Managed Pricing.

**Built:**
- **Tier enforcement** (`app/lib/billing/enforce.ts`, pure, 8 tests): `canEnrich`, `promptLimit`, `scanCadence`, `competitorLimit` from the single PLANS config, plus `assertCanEnrich` / `assertWithinPromptLimit` / `assertWithinCompetitorLimit` (throw `TierLimitError`). 100% covered per brief.
- **Plan resolution** (`app/lib/billing/plan.server.ts`, +4 tests): `resolvePlanTier(billing)` calls `billing.check()` (works arg-less for Managed Pricing), maps the active subscription name → PlanKey (defaults FREE), mirrors onto `Shop.planTier`. `managedPricingUrl(shop)` builds the admin pricing page URL. Added `APP_HANDLE` config (env-overridable; verify vs Partner Dashboard).
- **Server-side enrichment gate**: Products action calls `assertCanEnrich(plan)` before generate/approve — enforced even against a direct API call, not just the UI (QA-7). UI shows an "Available on Growth & Pro" upgrade banner + Manage-plan button for Free/Starter.
- **Settings**: Plan card (current plan badge + $/mo + Manage plan → Managed Pricing), plus the existing llms.txt / robots / JSON-LD sections.

**QA (Level 1):** typecheck ✅ · lint ✅ (deprecation only) · tests **96/96** ✅ · build ✅.

**Remaining to close QA-7 (needs Rahul + live test billing):** create the 4 plans (Free/Starter/Growth/Pro, 7-day trial) in the Partner Dashboard's Managed Pricing; verify `APP_HANDLE` matches the dashboard handle; then live-test trial→paid, decline→lockout (billing.check returns no active sub → FREE → enrichment gated, data retained), cancel→reinstall→re-subscribe, upgrade-takes-effect-immediately (we read plan live each load). Managed Pricing handles proration/trial/cancellation; billing webhooks are not required because plan is read live via billing.check. Prompt/competitor limit enforcement is wired (assert fns ready) and attaches when Phase 4 builds the prompt/competitor CRUD routes.

### 2026-07-18 — Phase 6 llms.txt + JSON-LD + robots guidance
**Built:**
- **Product.status** added to schema (migration `20260718132752_add_product_status`) and persisted during sync — so llms.txt can exclude DRAFT/ARCHIVED (QA-6: no draft leaks).
- **llms.txt generator** (`app/lib/llmstxt/generate.ts`, pure, 6 tests): well-formed markdown index of ACTIVE products with correct storefront URLs; excludes drafts/archived/handle-less; sanitizes titles. Served **live from the DB** via an app-proxy route (`app/routes/proxy.llms[.]txt.tsx`) at `https://{shop}/apps/cited/llms.txt` — always current, so the "refresh within 24h" gate is met without a job. `[app_proxy]` added to `shopify.app.toml`.
- **robots.txt AI-crawler auditor** (`app/lib/robots/audit.ts`, pure, 6 tests): parses robots.txt into user-agent groups, detects whether each AI crawler (OAI-SearchBot, GPTBot, PerplexityBot, Google-Extended, ClaudeBot, Applebot-Extended) is blocked (exact group preferred over wildcard), and builds a copy-paste `robots.txt.liquid` fix. Settings page fetches the live storefront robots.txt and renders per-crawler Allowed/Blocked badges + the fix snippet.
- **JSON-LD theme app extension** (`extensions/cited-schema/`): app-embed block injecting Organization (all pages) and Product + Offer + AggregateRating + Brand + FAQPage (product pages) into `<head>`. FAQPage reads the `cited.faq` metafield written by Phase 3 enrichment. Inert `<script type="application/ld+json">` only — zero render-blocking weight.
- **Settings page** rebuilt: llms.txt URL (copy/open), robots audit + re-check + copy-paste fix, and JSON-LD enable instructions.

**QA (Level 1):** typecheck ✅ · lint ✅ (deprecation warning only) · tests **84/84** ✅ (added llms.txt ×6, robots ×6) · build ✅.

**Remaining to close QA-6 (needs deploy + `shopify app dev`/live store):** set `[app_proxy].url` to the live app URL and `shopify app deploy` (currently placeholder `example.com/proxy`), then verify the llms.txt URL loads and excludes a draft product; enable the "Cited SEO Schema" app embed in the theme editor and validate 5 product types (incl. one no-reviews, one with variants) against Google's Rich Results Test; confirm Lighthouse delta < 2; verify the robots audit against a crafted robots.txt on the live store. JSON-LD is Liquid so not unit-tested — validated live per QA-6.

### 2026-07-18 — Phase 3 AI enrichment (Claude): adapter, generate, approve/write-back/rollback
**Built:**
- **LLMProvider adapter** (`app/lib/llm/`): provider-agnostic interface + Anthropic implementation via `@anthropic-ai/sdk` (model `claude-opus-4-8`, structured JSON output via `output_config.format`, SDK auto-retries 429/5xx). `getEnrichmentProvider()` returns null when `ANTHROPIC_API_KEY` is unset so the UI degrades gracefully. Pure cost accounting (`cost.ts`, $5/$25 per 1M) → logged to `LlmUsage` on every call.
- **Enrichment generation** (`app/lib/enrichment/generate.server.ts`): fetches current product fields from Admin GraphQL, calls the LLM, parses+sanitizes, logs cost, and persists `EnrichmentDraft` rows (description / faq / attributes) in DRAFT status with `originalValue` captured for rollback. Never writes to the store.
- **Injection-resistant prompt** (`prompt.ts`, pure): product data fenced + labeled untrusted; system prompt forbids inventing facts/hype and forbids acting on instructions inside product data; output constrained to a JSON schema. `parseEnrichmentResponse` throws on malformed/refused output (graceful error).
- **Untrusted-output sanitizer** (`sanitize.ts`, pure): allowlist HTML sanitizer strips `<script>`/`<style>`/`<iframe>`, event-handler attrs, and script-URLs for the write-back path; our review UI never uses `dangerouslySetInnerHTML` (Polaris `<Text>` escapes), so LLM output renders inert in-app.
- **Approval gate** (`gate.ts`, pure): `assertApproved()` — the single chokepoint every write-back passes; throws unless status is APPROVED (brief §2.4: never write without explicit approval).
- **Write-back flow** (`apply.server.ts`): `approveDraft` → `applyDraft` (Admin `productUpdate` for description, `metafieldsSet` for faq/attributes under `cited` namespace), `rejectDraft`, `rollbackDraft` (restores original description / deletes new metafields). All ownership-checked by shopId.
- **UI** (`app.products.tsx`): product modal now has an AI-enrichment section — Generate/Regenerate, per-draft preview, Approve & apply / Reject / Roll back, with success/error banners. Disabled with a clear message when no API key.

**QA (Level 1):** typecheck ✅ · lint ✅ (deprecation warning only) · tests **72/72** ✅ (added: gate bypass ×3, sanitizer XSS ×6, prompt/parse ×6, cost ×4) · build ✅. Safety-critical logic (approval gate, XSS sanitize, malformed-response handling, injection-prompt construction, cost math) is unit-tested pure.

**Remaining to close QA-3 (needs `ANTHROPIC_API_KEY` + `shopify app dev` on a real store):** one live generation; verify write-back appears on the storefront; live prompt-injection test ("ignore previous instructions…" in a description); rollback on a real product; malformed/refused handling against a live edge case. **Also flagged:** verify the `productUpdate` mutation argument name against Admin GraphQL **2026-07** (used `product: ProductUpdateInput!`) before the live write-back QA — one-line change in `apply.server.ts` if it differs. DB-integration tests for generate/apply/rollback (mocked prisma+admin) not yet written — the *pure* safety guards they rely on are tested.

### 2026-07-18 — Phase 2 catalog sync + readiness UI + product webhooks; plans → 4 tiers
**Built:**
- **Catalog sync service** (`app/lib/products/sync.server.ts`): Admin GraphQL products query with cursor pagination, throttle-aware backoff, `first: 8`/page to stay under the 1000-point single-query cost ceiling (variants(100) dominates). Maps each node → `ScorableProduct` → `scoreProduct()` → persists `Product` (readinessScore + full scoreBreakdown JSON) and replaces its `ProductIssue` rows in a transaction. Also `syncSingleProduct` (webhook re-score) and `deleteProduct`.
- **Pure mapping layer** (`app/lib/products/map.ts` + 4 tests): GraphQL node → `ScorableProduct`; counts only IMAGE media, coerces nulls, passes store policies through. Reviews left `null` (review-source adapter deferred; the reviews rule nudges the merchant).
- **Store policies**: one `shop { shopPolicies }` query per sync → `hasReturnPolicy`/`hasShippingPolicy`.
- **Shop provisioning** (`app/lib/shop.server.ts`): idempotent `ensureShop(domain)` upsert; called on every authed load + webhook.
- **Products page** (`app/routes/app.products.tsx`): real Polaris `IndexTable` — title, score Badge (tone by band), issue count; score-band filter (all/needs-work/fair/good, server-side); row → Modal with fix list (severity badges) + per-rule score breakdown (ProgressBars); empty state with Sync CTA; "Sync catalog" primary action wired to the route `action`.
- **Overview** (`app/routes/app._index.tsx`): live store-level readiness score + product count from DB (mean via Prisma aggregate); empty vs scored states.
- **Read helpers** (`app/lib/products/query.server.ts`): `listProducts(shopId, band)`, `storeReadiness(shopId)`.
- **Product webhooks**: `products/create|update|delete` routes + `shopify.app.toml` subscriptions; shared `productGidFromPayload` helper. Create/update re-fetch+re-score via `syncSingleProduct`; delete removes (issues cascade).
- **Plans → 4 tiers** (per Rahul): `Free $0 / Starter $19 / Growth $49 / Pro $99` in `app/config.ts` (single source; added `competitorLimit`, `PlanKey`, `PAID_PLAN_ORDER`). `PlanTier` enum extended with `FREE`, `PRO` (migration `20260718091127_add_free_and_pro_plan_tiers`, applied to Railway). `plans.ts` `Tier` type + `planForTier` updated; new tests.

**QA (Level 1):** typecheck ✅ · lint ✅ (deprecation warning only) · tests **53/53** ✅ (added map ×4, plans ×2) · build ✅ (cosmetic Polaris `and print` CSS warning). Live DB smoke-tested against Railway: `ensureShop` idempotent, empty aggregate shape correct, `PRO` enum accepted, cleanup ok.

**Remaining to close QA-2 (needs live dev store + `shopify app dev`):** spot-check 10 products field-by-field vs Shopify admin; webhook update reflected in DB <30s; 5k-product catalog without rate-limit errors (see bulk-operations follow-up); table paginates/filters correctly in the embedded UI. Scoring determinism already proven by tests.

### 2026-07-05 — Phase 0 kickoff
- Repo initialized (`git init`), `PROJECT_BRIEF.md` saved verbatim, `PROGRESS.md` created.
- Read brief in full. Produced Phase 0 deliverables: scope restatement, open questions/ambiguities, manual setup checklist, and flagged stack/requirement concerns to verify against shopify.dev before Phase 1.
- No code written (correct for Phase 0 / QA-0).
- **Blocking on Rahul:** answers to the open-questions list below before Phase 1 can start.

### 2026-07-05 — QA-1 verified on live dev store + `/loop` autonomous mode
- **App installed & running on `cited-dev-gc.myshopify.com`** (Greaycloud org) via `shopify app dev`.
- **Root cause fixed:** manual template clone left `shopify.web.toml.liquid` un-rendered, so the CLI never started the Remix server and the embedded frame showed the placeholder `example.com`. Rendered it to `shopify.web.toml` (predev `prisma generate`; dev `prisma migrate deploy && remix vite:dev`) and removed the `.liquid`. Also added `[build] automatically_update_urls_on_dev = true` + `dev_store_url` so dev swaps in the tunnel URL.
- **After fix:** app_home uses a live tunnel; embedded Overview page renders (both score cards + nav). Scopes auto-granted `read_products,write_products`.
- **`/healthz` independently verified** over the tunnel → `{"status":"ok","db":"up"}` (proves app→Railway Postgres path).
- **QA-1 report:** install ✅ · embedded load ✅ · healthz/DB ✅ · typecheck/lint/tests/build/secret-scan ✅. Reload-persistence + reinstall-after-uninstall: not yet human-confirmed (user switched to `/loop` autonomous mode) — carried as a small open item, not blocking.
- **Mode:** user invoked `/loop` ("ready to ship app, keep working till satisfied"). Proceeding autonomously through code-buildable work; will hand back for live-store/API-key/billing/beta steps.

### 2026-07-05 — Database provisioned & migrated
- **Railway Postgres provisioned** (project `cooperative-delight`, service Online). Local dev connects via the public TCP proxy (`DATABASE_PUBLIC_URL`); value stored in gitignored `.env` as `DATABASE_URL`.
- **Initial migration applied:** `prisma/migrations/20260705135135_init` — all 11 domain tables + `Session` created and in sync. Verified connectivity + table list via `information_schema` (DB path that `/healthz` uses works).
- Prisma Client generated.
- Note: Railway free credit shows "30 days or $5.00 left" — fine for dev; watch before beta.
- ⚠️ Dev-DB password was shared in chat; rotate in Railway before production (non-blocking for dev).

### 2026-07-05 — App linked + brand rename
- **`shopify app config link` succeeded** — local project linked to Partner app **"Cited"** (client_id `4d2f3b73…`). `shopify.app.toml` now carries client_id, `embedded = true`, `use_legacy_install_flow = false` (token exchange), api_version `2026-07`.
- **Brand renamed Aivo → "Cited"** via the single constant `APP_NAME` in `app/config.ts` (plus package name + doc/comment headers). No other code touched — this is exactly why the brief mandated one brand constant.
- **Scopes restored:** `config link` overwrote scopes with empty (dashboard app has none set yet); set back to `read_products,write_products` in the toml. Run `shopify app deploy` to push this config to the dashboard.
- **API version aligned:** `shopify.server.ts` bumped `January25 → July26` to match the linked config's `2026-07` (latest, supported by installed `@shopify/shopify-api@13.1.0`).
- Re-verified after changes: typecheck ✅, tests 7/7 ✅, lint ✅.
- **Still needed to close QA-1:** a reachable **Postgres** DB (`DATABASE_URL`), then `npx prisma migrate dev`, then `shopify app dev` to run the OAuth install on the dev store. `application_url`/`redirect_urls` are placeholders until `shopify app dev` sets the tunnel URL.

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
- ⚠️ **CI workflow not on GitHub yet:** `.github/workflows/ci.yml` exists on disk and is locally green, but the push was rejected — the git/`gh` token lacks GitHub's `workflow` scope. **Action for Rahul:** run `gh auth refresh -s workflow` (or use a PAT with `workflow` scope), then `git add .github/workflows/ci.yml && git commit -m "add CI workflow" && git push`. Until then CI does not run on GitHub.
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
- **Plans (2026-07-18):** 4 tiers — Free $0, Starter $19, Growth $49, Pro $99 (was 2). Free is a real selectable $0 tier to drive installs; `NONE` remains the pre-selection state. Limits live only in `app/config.ts::PLANS`. Server-side enforcement still lands in Phase 7.

## Open issues / bugs
- **Follow-up (Phase 2 scaling):** catalog sync uses cursor pagination (safe for typical catalogs). The QA-2 5k-product gate should move sync to Shopify **Bulk Operations** (`bulkOperationRunQuery` → poll → download JSONL → parse). The pure map/score layer is already decoupled, so this swap is isolated to `sync.server.ts`. Not blocking normal-size stores.
- Reviews signal is `null` until a review-source adapter is added (metafields / review app); the reviews rule currently emits a LOW "connect a review source" nudge.

## Flags: brief vs. current Shopify requirements (to verify live at Phase 1)
- **Billing:** brief specifies Billing API recurring charges. Shopify now steers new apps toward **Managed Pricing**. Must confirm which is required/allowed before Phase 7 design — pull live from shopify.dev.
- **Auth:** brief says "OAuth install flow." Current Remix template default is **session-token / token-exchange** auth. Will use the template default unless Rahul wants classic OAuth.
- **Scopes:** brief lists `read_content` and `read_online_store_pages`; these overlap/have changed names across API versions. Verify exact current scope names before requesting them (fewer scopes = easier review).
- **robots.txt:** confirmed constraint — Shopify only allows edits via `robots.txt.liquid`; app can instruct, not force. Brief already accounts for this.

## Planned feature — External analytics connectors (new, 2026-07-18)
Requested by Rahul: let each merchant link *their own* Google Search Console,
Google Analytics 4, and Microsoft Clarity. All three are "connect a data source
the merchant already owns" — but the auth models differ. Key principle: **we hold
one app-level credential per provider; each merchant self-authorizes their own
account.** No client ever supplies our credentials, and no client sees another's data.

**1) Google Search Console + 2) GA4 — share ONE Google OAuth client:**
- ONE Google Cloud project + ONE OAuth 2.0 client (`GOOGLE_OAUTH_CLIENT_ID` /
  `GOOGLE_OAUTH_CLIENT_SECRET` in env), owned by us. Request both scopes:
  - GSC: `https://www.googleapis.com/auth/webmasters.readonly`
  - GA4: `https://www.googleapis.com/auth/analytics.readonly`
- Each merchant clicks Connect → Google consent (offline access) → we store a
  **per-shop refresh token** (encrypted; new `AnalyticsConnection` table keyed by
  shopId+provider). Merchant picks which GSC property / GA4 property to use.
- Data: GSC `searchanalytics.query` (clicks/impressions/CTR/position); GA4 Data API
  `runReport` (sessions, conversions, traffic sources, landing pages).
- **Blocking constraint — start early:** both are Google **sensitive scopes**;
  serving arbitrary external merchants in production needs **Google OAuth app
  verification** (consent-screen review; ~100 test-user cap until approved). Real
  lead time — begin before public launch. Analogous to Shopify's app review.

**3) Microsoft Clarity — NOT OAuth; per-shop API token:**
- Clarity's Data Export API uses a **project-level Bearer token** the merchant
  generates in their own Clarity dashboard (Settings → Data Export). No OAuth flow.
- UI: a field where the merchant pastes their Clarity API token → stored per-shop
  (encrypted, same `AnalyticsConnection` table, provider="clarity").
- Data: `GET /export-data/api/v1/project-live-insights` — traffic, scroll depth,
  dead/rage clicks, top pages. **Limited**: short lookback window (recent days),
  capped requests/day. Good for UX-signal context, not deep historical analysis.

**Scope note:** GSC/GA4/Clarity report *traditional* search & on-site behavior; they
do not isolate AI-answer-engine citations. They **complement** — not replace — the
citation-tracking wedge (Phase 4). Sequence these connectors **after** the core
AI-SEO phases (they're additive to the brief, not part of the v1 wedge). Suggested:
bundle as a single "Integrations" phase once Phases 3–7 land, given the shared
`AnalyticsConnection` model + Settings UI.

## v2 backlog (do not build)
Perplexity/Claude tracking engines · agency multi-store dashboard · auto-published citation-target content · off-site mention monitoring · OpenAI merchant feed export · Klaviyo/review-app integrations · white-label reports for agencies.
