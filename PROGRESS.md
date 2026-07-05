# PROGRESS — Aivo (AI Search Visibility Suite for Shopify)

Running log of what was built, QA status, open issues, decisions, and assumptions.
Newest entries at the top of each section.

---

## Phase status

| Phase | Name | Status | QA gate |
|-------|------|--------|---------|
| 0 | Alignment (no code) | PASSED | QA-0 ✅ (scope restated, ambiguities resolved by Rahul) |
| 1 | Scaffold & Auth | PASSED* | QA-1 ✅ install/embedded/healthz verified; reload+reinstall pending human confirm |
| 2 | Catalog Sync & Readiness Engine | IN PROGRESS | scoring engine (pure module) building first |
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

## Open issues / bugs
- (none — no code yet)

## Flags: brief vs. current Shopify requirements (to verify live at Phase 1)
- **Billing:** brief specifies Billing API recurring charges. Shopify now steers new apps toward **Managed Pricing**. Must confirm which is required/allowed before Phase 7 design — pull live from shopify.dev.
- **Auth:** brief says "OAuth install flow." Current Remix template default is **session-token / token-exchange** auth. Will use the template default unless Rahul wants classic OAuth.
- **Scopes:** brief lists `read_content` and `read_online_store_pages`; these overlap/have changed names across API versions. Verify exact current scope names before requesting them (fewer scopes = easier review).
- **robots.txt:** confirmed constraint — Shopify only allows edits via `robots.txt.liquid`; app can instruct, not force. Brief already accounts for this.

## v2 backlog (do not build)
Perplexity/Claude tracking engines · agency multi-store dashboard · auto-published citation-target content · off-site mention monitoring · OpenAI merchant feed export · Klaviyo/review-app integrations · white-label reports for agencies.
