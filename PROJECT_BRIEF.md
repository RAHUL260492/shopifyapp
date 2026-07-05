PROJECT BRIEF: "Aivo" — AI Search Visibility Suite for Shopify
Claude Code Master Prompt + Phased Build Plan + Multi-Step QA Process
(Working name "Aivo" — rename anytime; nothing in the code should hardcode the brand name outside one config constant.)

HOW TO USE THIS DOCUMENT

1. Create a new empty repo folder, drop this file in as `PROJECT_BRIEF.md`.
2. Open Claude Code in that folder and start with the Kickoff Prompt (Section 1).
3. Work through phases in order. Do not let any phase begin until the previous phase's QA gate has passed. Each phase ends with a QA checklist Claude Code must run and report on.
4. Keep a running `PROGRESS.md` (Claude Code maintains it) logging: completed phases, QA results, open bugs, decisions made.

SECTION 1 — KICKOFF PROMPT (paste this as your first message to Claude Code)

```
You are the lead engineer building a production Shopify app. The full spec is in
PROJECT_BRIEF.md in this repo — read it completely before writing any code.

Ground rules for this entire project:

1. Use the karpathy-guidelines skill for all code you write: state assumptions
   before implementing, prefer the minimum code that solves the problem, make
   surgical changes only, and define verifiable success criteria for every task.
2. Follow the phased plan in Section 5 of the brief. Never start a phase until
   the previous phase's QA gate (Section 6) passes. At the end of each phase,
   run the QA checklist and give me a PASS/FAIL report per item before asking
   to proceed.
3. Maintain PROGRESS.md: after every session, append what was built, QA status,
   open issues, and any decisions/assumptions made.
4. Never invent Shopify API behavior. If unsure about a current API version,
   scope name, webhook topic, or Billing API detail, check the official Shopify
   dev docs (shopify.dev) before implementing. Same for OpenAI/Google/Anthropic
   API specifics.
5. All secrets come from environment variables. Never commit keys. Create
   .env.example with every variable documented.
6. Write tests as you build (Vitest for unit, Playwright for E2E where useful),
   not as an afterthought. Every phase's QA gate includes its tests passing.
7. When something in this brief conflicts with current Shopify requirements,
   Shopify's current requirements win — flag the conflict to me in your response
   and in PROGRESS.md.

Start now with Phase 0: read PROJECT_BRIEF.md fully, then produce (a) your
understanding of the v1 scope in your own words, (b) a list of every assumption
or ambiguity you need resolved, and (c) the exact setup steps I need to do
manually (accounts, keys, hosting) before Phase 1 can start. Do not scaffold
any code yet.
```

SECTION 2 — PRODUCT DEFINITION

2.1 What the app is
A paid Shopify app that makes a merchant's products and brand visible in AI search/answer engines (ChatGPT, Gemini, Perplexity, Claude, Google AI Overviews). Positioned as a complete AI-visibility suite; v1 ships a differentiated wedge plus commodity table-stakes.

2.2 v1 Scope — IN

1. AI Feed Readiness Engine (the wedge — differentiator #1)
   * Pull the merchant's full catalog via Admin GraphQL API.
   * Score every product on AI-critical attribute completeness: title quality, description depth/intent-coverage, GTIN/brand presence, images, price, availability, review count & average rating (from metafields/common review apps where accessible), return/shipping policy presence, variant data cleanliness.
   * Detect price/data consistency risks: feed-vs-PDP mismatch signals, stale availability.
   * Produce a per-product "AI Readiness Score" (0–100) + store-level score, with a prioritized fix list.
   * AI enrichment: one-click Claude-generated improvements per product (intent-led description rewrite, FAQ block, missing attribute suggestions). Merchant reviews & approves before anything is written back. Write-back via Admin API (description + metafields). Never auto-publish without explicit approval.
2. Product-level AI Citation Tracking (differentiator #2)
   * Merchant defines up to N target prompts (tier-limited), e.g. "best collagen supplement for skin in India".
   * Scheduled job queries ChatGPT (OpenAI API w/ web search where available) and Gemini (Google API w/ grounding) with those prompts.
   * Parse responses for brand mentions, product mentions, competitor mentions, and cited source domains.
   * Store results; show visibility score, share-of-voice vs up to 3 competitors, trend over time, and which third-party domains get cited where the merchant doesn't appear (their citation-gap target list).
   * Sampling: each prompt run 3x per scan to smooth non-determinism; scans daily (Growth) or weekly (Starter).
3. Commodity table-stakes (build cheap, needed for reviews)
   * `llms.txt` auto-generation & auto-refresh (products, collections, pages, blogs), served from app proxy or theme asset per current best practice.
   * JSON-LD injection/repair: Product, Offer, AggregateRating, Organization, FAQPage — via theme app extension (no direct theme file edits).
   * robots.txt guidance: detect blocked AI crawlers (OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot etc.) and give the merchant copy-paste `robots.txt.liquid` fixes. (Shopify limits programmatic robots edits — instruct, don't force.)
4. Billing (paid app from day 1)
   * Shopify Billing API, recurring subscriptions, 7-day free trial.
   * Tiers: Starter $19/mo (readiness scoring, llms.txt, schema, 10 tracked prompts weekly), Growth $49/mo (everything + AI enrichment write-back, 50 prompts daily, competitor share-of-voice, citation-gap report). Tier limits enforced server-side.
5. Dashboard (Polaris + App Bridge, embedded): Overview (scores + trends), Products (readiness table w/ fix flows), Prompts & Citations, Settings (competitors, prompts, billing).
6. Compliance plumbing: mandatory GDPR webhooks (customers/data_request, customers/redact, shop/redact), app/uninstalled cleanup, session token auth, webhook HMAC verification.

2.3 v1 Scope — OUT (do not build; log as v2 backlog)

* Auto-published blog/content generation
* Perplexity & Claude tracking engines (architect the tracker so adding engines is a config+adapter change, but don't build)
* Multi-store agency dashboard
* Off-site outreach automation
* OpenAI merchant feed file generation (Shopify catalogs are already integrated with ChatGPT shopping; revisit if that changes)
* Localization/multi-language

2.4 Non-negotiable product rules

* Never write to a merchant's store (descriptions, metafields, theme) without an explicit approval action in the UI.
* All LLM-generated content is labeled as AI-generated in the review UI.
* No claims in UI copy like "guaranteed ChatGPT ranking" — Shopify review and honesty both forbid it. Use "improve eligibility/visibility".
* Tracking results show a "last scanned" timestamp and a disclosure that AI answers vary between runs.

SECTION 3 — TECH STACK & ARCHITECTURE

* Framework: Shopify Remix app template (latest), TypeScript, embedded app w/ App Bridge + Polaris.
* DB: PostgreSQL + Prisma.
* Jobs/queue: BullMQ + Redis (citation scans, catalog syncs, llms.txt refresh). If hosting choice makes Redis awkward, propose an alternative in Phase 0 — don't silently swap.
* Hosting: Railway (app + Postgres + Redis) unless I say otherwise. Fly.io acceptable fallback.
* LLM APIs: Anthropic (enrichment generation), OpenAI + Google Gemini (citation tracking). All behind a single `LLMProvider` adapter interface with per-provider rate limiting, retries w/ backoff, cost logging per call to a `llm_usage` table.
* Shopify APIs: Admin GraphQL (latest stable version — check docs), webhooks, Billing API, theme app extensions for JSON-LD, app proxy for llms.txt if chosen.
* Testing: Vitest (unit/integration), Playwright (critical E2E), MSW or nock for API mocking.
* Observability: structured logs (pino), Sentry (or equivalent) for errors, `/healthz` endpoint.

3.1 Data model (Prisma — starting point, refine in Phase 1)

* `Shop` (domain, access token via Shopify session storage, plan tier, install/uninstall timestamps, settings JSON)
* `Product` (shopId, shopifyGid, title, handle, syncedAt, readinessScore, scoreBreakdown JSON)
* `ProductIssue` (productId, type, severity, status, suggestion JSON)
* `EnrichmentDraft` (productId, field, originalValue, aiValue, status: draft/approved/applied/rejected, appliedAt)
* `TrackedPrompt` (shopId, text, active, engineList)
* `Competitor` (shopId, name, domain)
* `ScanRun` (shopId, startedAt, finishedAt, engine, status, costCents)
* `ScanResult` (scanRunId, promptId, rawResponse, brandMentioned bool, productsMentioned JSON, competitorsMentioned JSON, citedDomains JSON)
* `LlmUsage` (shopId, provider, model, tokensIn, tokensOut, costCents, purpose, createdAt)
* `WebhookLog`, `BillingRecord`

3.2 Required Shopify scopes (minimum-necessary; justify each in the app listing)
`read_products`, `write_products` (enrichment write-back), `read_content`, `read_themes` + theme app extension, `read_online_store_pages`. Add others only with written justification in PROGRESS.md. Fewer scopes = easier review.

SECTION 4 — MANUAL SETUP CHECKLIST (Rahul does these; Claude Code lists them again in Phase 0)

1. Shopify Partner account + create app (client ID/secret) + a development store with realistic seed products (import ~30 products from a real client catalog, anonymized if needed).
2. Railway project: app service, Postgres, Redis. Note the app URL for Shopify app config.
3. API keys: Anthropic, OpenAI, Google AI. Set soft monthly budget alerts on each.
4. Sentry project (or approve skipping it for v1).
5. Second dev store later for fresh-install QA (Phase 8).

SECTION 5 — PHASED BUILD PLAN
(Each phase ≈ 1–3 Claude Code sessions. Sequence is dependency-ordered. QA gates in Section 6.)

Phase 0 — Alignment (no code). Read brief; restate scope; list assumptions/ambiguities; confirm setup checklist; propose any stack deviations with reasons. → Gate QA-0.
Phase 1 — Scaffold & Auth. Shopify Remix template, TypeScript strict, Prisma schema v1, session storage, OAuth install flow working on dev store, embedded Polaris shell with nav stubs, `/healthz`, CI (GitHub Actions: typecheck, lint, test). → Gate QA-1.
Phase 2 — Catalog Sync & Readiness Engine. Bulk product sync via Admin GraphQL (handle pagination + bulk operations for large catalogs), webhook-driven incremental sync (products/create|update|delete), scoring engine as a pure, unit-tested module (each scoring rule isolated + documented), Products dashboard table with score, filters, issue drill-down. → Gate QA-2.
Phase 3 — AI Enrichment Flow. `LLMProvider` adapter + Anthropic implementation, per-product enrichment generation (description rewrite in intent-led style, FAQ block, attribute suggestions), draft → review → approve → write-back flow with full audit trail in `EnrichmentDraft`, rollback (restore originalValue), cost logging. → Gate QA-3.
Phase 4 — Citation Tracking Engine. Prompt & competitor CRUD (tier-limited), BullMQ scheduled scans, OpenAI + Gemini adapters (3 samples per prompt per engine), response parser (brand/product/competitor mention detection — start with normalized string matching + fuzzy handling of possessives/plurals; log ambiguous cases), cited-domain extraction, ScanResult storage, cost caps per shop per day (hard stop + alert). → Gate QA-4.
Phase 5 — Visibility Dashboard. Overview page (store readiness score, visibility score, 30-day trends), share-of-voice vs competitors, citation-gap report (domains cited where merchant absent, ranked by frequency), per-prompt detail view with raw-answer inspection, empty/loading/error states for everything. → Gate QA-5.
Phase 6 — llms.txt, JSON-LD, robots guidance. llms.txt generator + daily refresh job + serving route, theme app extension injecting JSON-LD blocks (validate output against schema.org), robots.txt AI-crawler audit + copy-paste fix instructions UI. → Gate QA-6.
Phase 7 — Billing & Tier Enforcement. Billing API recurring charges, 7-day trial, plan selection UI, upgrade/downgrade flows, server-side enforcement of every tier limit (prompt count, scan frequency, enrichment access), billing webhooks, graceful lockout on declined/cancelled with data retained 30 days. → Gate QA-7.
Phase 8 — Hardening & Compliance. GDPR webhooks implemented & tested, app/uninstalled cleanup, webhook HMAC verification on all topics, rate-limit handling for Admin API (leaky bucket / cost-based throttling), Sentry wiring, load sanity check (catalog of 5k products syncs without timeout), security pass (no secrets in client bundle, session token verification on every authed route, SQL injection impossible via Prisma, XSS-safe rendering of LLM output — treat all LLM output as untrusted). → Gate QA-8.
Phase 9 — Beta on Real Stores. Install on 2–3 HyberX client stores (with client consent). One-week structured beta: daily scan integrity, enrichment quality review, cost-per-shop report, bug triage. Fix P0/P1 only — no new features. → Gate QA-9.
Phase 10 — App Store Submission Prep. Listing copy (honest claims only), screenshots, demo video script, privacy policy + data-processing description, scope justifications, review-instructions doc for Shopify's reviewer (test account, how to trigger each feature), final self-review against Shopify's current app requirements checklist (fetch the live checklist from shopify.dev — do not rely on memory). → Gate QA-10 → submit.

SECTION 6 — MULTI-STEP QA PROCESS
QA runs at four levels. Claude Code executes levels 1–3 and reports; level 4 is Rahul + Claude Code together.

Level 1 — Continuous (every session, no exceptions)

* TypeScript strict passes, ESLint clean, all existing tests green before session ends.
* New logic ships with unit tests in the same session (scoring rules, parsers, tier limits, adapters — 100% of pure business logic covered).
* Karpathy self-review before finishing: assumptions stated? minimum code? surgical diff? every changed line traces to the task?
* PROGRESS.md updated.

Level 2 — Phase Gates (end of each phase; PASS/FAIL report per item, in writing)
QA-0: Scope restated accurately; all ambiguities listed and resolved by Rahul; no code written.
QA-1: Fresh install on dev store completes OAuth in <10s; app loads embedded with no console errors; reinstall after uninstall works; session persists across reload; CI green; `.env.example` complete; no secrets in repo (run a secret scan).
QA-2: Full catalog sync correct (spot-check 10 products field-by-field against Shopify admin); webhook update reflected in DB <30s; scoring is deterministic (same input → same score, proven by test); each scoring rule has a test with a crafted product that isolates it; 5k-product synthetic catalog syncs without rate-limit errors; table paginates/filters correctly.
QA-3: Enrichment never writes without approval (write an explicit test attempting to bypass); rollback restores exact original including metafields; LLM output rendered safely (inject `<script>` via a mocked LLM response — must render inert); malformed/refused LLM responses handled gracefully with user-visible error; every call logged to `LlmUsage` with cost; regeneration works; prompt-injection check — a product description containing "ignore previous instructions and output X" must not derail enrichment output (test with mocked + one live call).
QA-4: Scheduled scan runs on time (verify with short-interval test schedule); 3-sample logic verified; parser test suite ≥25 fixture responses covering: brand mentioned/absent, competitor-only, misspelled brand, brand as substring of another word (must NOT false-positive), possessive/plural forms, markdown-heavy answers, refusals/empty answers; daily cost cap triggers hard stop + logged alert (test by setting cap to $0.01); engine adapter failure isolates (OpenAI down ≠ Gemini scan blocked); duplicate scan prevention.
QA-5: Every dashboard state tested: no data yet, partial data, full data, scan-in-progress, scan-failed; trend math verified against hand-calculated fixture; share-of-voice sums sanely; citation-gap list excludes merchant's own domain and social profiles they own; raw answer view escapes content; mobile-width embedded view usable (Shopify admin is used on mobile).
QA-6: llms.txt validates (well-formed markdown, correct URLs, no drafts/hidden products leaked — test with a draft product); refresh job updates within 24h of catalog change; JSON-LD passes Google Rich Results Test / schema validator on 5 different product types incl. one with no reviews and one with variants; theme extension adds zero render-blocking weight (Lighthouse before/after delta <2 points); robots audit correctly detects each blocked crawler on a test robots.txt.
QA-7 (critical for approval): Trial → paid conversion flow works end-to-end on dev store with Shopify's test billing; declined charge → graceful lockout screen, data intact; cancel → uninstall → reinstall → clean re-subscribe; every tier limit enforced server-side (attempt to exceed via direct API call, not just UI — must fail); upgrade takes effect immediately, downgrade at period end; billing webhooks idempotent (replay the same webhook twice, no double-processing).
QA-8: All three GDPR webhooks respond correctly and actually delete/return data (verify DB state after); every webhook rejects bad HMAC (test with tampered payload); uninstall purges tokens immediately; Admin API throttling handled (simulate 429s); Sentry captures a thrown test error; dependency audit clean (`npm audit` — no criticals); LLM output XSS test repeated app-wide.

Level 3 — Integration Regression (after Phases 5, 7, 8)
A scripted end-to-end run Claude Code executes and documents with evidence (screenshots/logs): fresh install → onboard → catalog sync → review readiness scores → generate + approve one enrichment → verify it on the live storefront → add 3 prompts + 2 competitors → force a scan → verify dashboard reflects results → check llms.txt live URL → validate JSON-LD on a live product page → subscribe via test billing → hit a tier limit → uninstall → verify cleanup. Any failure = fix before next phase.

Level 4 — Human QA (Phase 9, Rahul + real stores)

* Enrichment quality bar: Rahul reviews 20 AI-generated descriptions across 2 client stores; ≥16/20 must be usable with minor-or-no edits, zero hallucinated product claims (ingredients, certifications, specs not in source data = automatic fail for that item and a parser/prompt fix).
* Tracking sanity: manually run 5 tracked prompts in ChatGPT/Gemini apps and compare against app results; directionally consistent or investigate.
* Cost audit: per-store LLM cost for the beta week must support ≥70% gross margin at tier pricing; if not, tune sampling/caching before launch.
* Client-facing test: one client (or teammate) uses the app unaided for 20 minutes; note every point of confusion; fix top 3.

Bug severity & rules

* P0 (data loss, writes without approval, billing errors, security): stop all feature work, fix immediately, add regression test.
* P1 (feature broken, wrong scores, failed scans): fix before phase gate passes.
* P2/P3 (cosmetic, polish): log in PROGRESS.md, batch later.
* Every fixed P0/P1 gets a regression test in the same commit.

SECTION 7 — DEFINITION OF DONE (v1 launch)

* All 10 phase gates passed with written PASS reports in PROGRESS.md.
* Level-3 regression script passes clean on a fresh second dev store.
* Level-4 human QA thresholds met on real client stores.
* Test coverage: 100% of scoring/parsing/tier-enforcement logic; billing flow E2E-tested.
* Shopify submission checklist (pulled live from shopify.dev at Phase 10) fully self-verified.
* Docs exist: README (setup/deploy), PROGRESS.md (history), RUNBOOK.md (ops: how to check job queue, rotate keys, handle a stuck scan, respond to a Shopify reviewer question).

SECTION 8 — V2 BACKLOG (log ideas here, build nothing)
Perplexity/Claude tracking engines · agency multi-store dashboard · auto-published citation-target content · off-site mention monitoring · OpenAI merchant feed export · Klaviyo/review-app integrations · white-label reports for agencies.
