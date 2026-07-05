# PROGRESS — Aivo (AI Search Visibility Suite for Shopify)

Running log of what was built, QA status, open issues, decisions, and assumptions.
Newest entries at the top of each section.

---

## Phase status

| Phase | Name | Status | QA gate |
|-------|------|--------|---------|
| 0 | Alignment (no code) | IN PROGRESS | QA-0 — awaiting Rahul's answers to open questions |
| 1 | Scaffold & Auth | not started | — |
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

---

## Decisions & assumptions
- (none locked yet — Phase 0 pending Rahul's answers)

## Open issues / bugs
- (none — no code yet)

## Flags: brief vs. current Shopify requirements (to verify live at Phase 1)
- **Billing:** brief specifies Billing API recurring charges. Shopify now steers new apps toward **Managed Pricing**. Must confirm which is required/allowed before Phase 7 design — pull live from shopify.dev.
- **Auth:** brief says "OAuth install flow." Current Remix template default is **session-token / token-exchange** auth. Will use the template default unless Rahul wants classic OAuth.
- **Scopes:** brief lists `read_content` and `read_online_store_pages`; these overlap/have changed names across API versions. Verify exact current scope names before requesting them (fewer scopes = easier review).
- **robots.txt:** confirmed constraint — Shopify only allows edits via `robots.txt.liquid`; app can instruct, not force. Brief already accounts for this.

## v2 backlog (do not build)
Perplexity/Claude tracking engines · agency multi-store dashboard · auto-published citation-target content · off-site mention monitoring · OpenAI merchant feed export · Klaviyo/review-app integrations · white-label reports for agencies.
