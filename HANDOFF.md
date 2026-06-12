# FeedLens Rails Rewrite — Handoff

The Rails 8 app in `rails/` replaces the Convex backend (`convex/`, frozen on branch
`typescript-v1`). The React SPA in `src/` now talks to it via the REST API in
`docs/rails_api_contract.md`. Boot instructions: `rails/README.md`. Acceptance state:
`MIGRATION_STATUS.md`.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `SECRET_KEY_BASE` | prod | Rails secrets (compose ships an insecure default for local use) |
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME`, `QUEUE_DATABASE_NAME` | prod | PostgreSQL (Solid Queue uses the queue DB) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed | Seeded admin login (defaults `admin@feedlens.local` / `FeedLens!2026`) |
| `DEFAULT_USER_PASSWORD` | — | Password for admin-created users when none supplied |
| `LAS_PUSH_API_KEY` | for LAS | Auth for `POST /api/push-flagged` (constant-time compared) |
| `ANTHROPIC_API_KEY` | for AI | Claude vision / param scans / suggesters |
| `OPENAI_API_KEY` | for AI | GPT-4o fallback vision |
| `IMPLIO_API_KEY` | for Implio | Used only when `IMPLIO_STUB=false` |
| `IMPLIO_STUB` | — | **Default ON** (unset ⇒ stub): logs Implio payloads instead of POSTing |
| `JE_API_BASE` | — | JE mobile API base (default `https://www.jamesedition.com`; e2e overlay points it at a mock) |
| `SMTP_ADDRESS/PORT/USERNAME/PASSWORD/AUTH/STARTTLS` | for mail | Devise password-reset mail; without `SMTP_ADDRESS` deliveries are disabled |
| `APP_HOST` / `APP_PORT` | — | Mailer link host/port (default localhost:8080) |
| `GOOGLE_APPLICATION_CREDENTIALS` | for BQ sync | Service-account JSON path in-container (compose default `/secrets/bigquery-credentials.json` from `./secrets/`; the sync no-ops with a log line when the file is absent) |
| `VITE_API_BASE` | frontend | API origin for the SPA build (default `""` = same origin behind nginx) |

## BigQuery listing sync

`BqListingSyncJob` (recurring.yml, daily 06:00 UTC) pulls active RealEstate/Car
listings (initial scope: ES/PT — `Listings::BqSync::COUNTRIES`) created at least
`SETTLE_HOURS` (48h) ago — the data_marts child tables (images in
`pg_listing_assets`, descriptions) lag the parent by ~24–48h, so moderating
fresher listings would run the engine on incomplete data (false
few_pictures/low_lqi/short_description, vision can't fetch images). Fresher
listings are deferred, not skipped. Pulls the newest `MAX_LISTINGS_PER_RUN`
(300) of the settled window from `data_marts` via `Listings::BqSync`,
watermarked on `listing_created_at` (`sync_states` row `bq_listings`,
bootstrapped to first-run time — no backfill). Each new listing runs through
`Moderation::Runner` with `param_scan: false` (no per-listing Claude call;
vision/LLM still fire on rule triggers). Existing `je_id`s are skipped;
flag-only (the Implio stub is untouched). Synced batches carry
`batch_id` `bq-sync-<date>`. Manual run: `bin/rails bq:sync`.
Note: `je_production_postgresql_readonly.*` in BigQuery is frozen (June 2020) —
always use `data_marts.pg_*`.

**Test harness (`bin/rails bq:test`).** On-demand sync over arbitrary
countries/volume/window, isolated from the cron — it does **not** read or
advance the production watermark and tags rows `batch_id bq-test-<date>`.
Use it to exercise the pipeline at larger scale or in other markets before
widening the cron's `MAX_LISTINGS_PER_RUN` (300) or `COUNTRIES` (ES/PT).

```bash
COUNTRIES=ES,PT,FR,IT LIMIT=1000 DAYS=14 bin/rails bq:test   # defaults: ES,PT / 100 / 7
SETTLE=0 bin/rails bq:test                                    # test FRESH listings (exposes the ETL lag)
bin/rails bq:test_purge                                       # delete all bq-test-* rows
```

It runs the **full** engine (`param_scan: false`, same as cron) including
vision + LLM verification on triggered listings, so Anthropic spend scales
with `LIMIT`. Returns a verbose summary (outcome distribution, top fired
rules, llm-triggered count). `Listings::BqSync.test_run(countries:, limit:,
since:)` is the underlying method.

## Importing production data later

`npx convex export` produces a ZIP of JSONL documents. Import it with:

```bash
bin/rails "convex:import[/path/to/export.zip]"   # or an extracted directory
```

(`lib/tasks/convex_import.rake`.) Both export layouts are supported (`<table>/documents.jsonl`
from `npx convex export`, and flat `<table>.jsonl` as produced by the production bot). It maps
camelCase docs to the snake_case tables, remaps Convex `_id` references (`listingId`,
`moderatorId`) to the new integer FKs (falling back to `je_id` lookup), upserts on natural keys
(composite keys for history tables, so re-runs are idempotent), and preserves `_creationTime`.

**Verified against the real production export** (June 2026, from Viktor's bot): 67 listings,
75 moderation results (all FKs remapped), 82 rules after merge, 6 moderators, 52 param scans,
5 vision results, 6 activity rows — zero errors, zero dropped fields, idempotent second run.
Import semantics are a **merge**: prod rows win on natural-key conflicts (4 live-edited rule
configs — e.g. `extremely_low_price_sqm` excluding US/AE — and the prod-only
`hundred_million_ads` rule are preserved), while seed-only rows remain (the 4 newer
`duplicates_within_single_account_*` / `five_hundred_million_ads` rules). The export ZIP itself
is deliberately NOT committed to the repo — it contains the team's emails and production data.

**Moderator passwords are not imported** — Convex stores Scrypt hashes that Devise/bcrypt
cannot verify (and the export doesn't include them anyway). Imported moderators get a random
password; set real ones via the Users page (admin) or Devise password reset (needs SMTP).

## Intentionally NOT migrated (and replacements)

| What | Why / replacement |
|---|---|
| Convex realtime subscriptions | REST + polling: sidebar stats every 7s, queue every 10s; every successful mutation triggers a global refetch of mounted queries (`src/hooks/useApiQuery.ts`) |
| Viktor Spaces email provider (`convex/ViktorSpacesEmail.ts`) | Standard Devise mailers; configure `SMTP_*` env. Without SMTP, admins set passwords directly |
| Convex Auth + Scrypt password hashes | Devise (bcrypt) session cookies; seeded env admin + admin-created users + password reset |
| Self-service signup (`convex/auth.ts` Password provider) | Decision: admin-created accounts only. `/signup` keeps its route but shows an "accounts are created by an administrator" notice (the original UI already redirected `/signup` → `/login`) |
| Test-auth plumbing (`testAuth.ts`, `seedTestUser.ts`, `VITE_IS_PREVIEW` test login, `_revokeLegacyTestAuth.ts`) | Dev/preview-only scaffolding for Convex deployments; not applicable |
| `viktorTools.ts` (`quickAiSearch`, `generateImage`) | Viktor-platform-specific endpoints; no UI references them |
| Convex `_storage` | Was unused (image "uploads" are base64/URL payloads, stored in tables) |

## Known behavioral differences (each deliberate)

1. **81 seeded rules, not 79.** The spec says 79 but `convex/seedAllRules.ts` contains 81
   entries (one, `too_low_price_430k`, ships disabled). TS wins; seeds are byte-derived from
   the TS arrays (`rails/db/seed_data/*.json`, extracted by executing the TS with bun).
2. **`originalOutcome` is preserved across repeated overrides.** TS overwrote it on every
   override (losing the true original); Rails keeps the first. Audit-trail improvement.
3. **Activity log covers more actions.** TS only logged user-CRUD; Rails also logs rule
   create/update/toggle/delete and decision overrides through the same `moderatorActivity`
   mechanism the TS UI displays.
4. **`GET /api/settings` requires an active moderator.** The Convex `getSettings` had no auth
   gate; the task mandates all reads behind auth.
5. **Rule/list AI suggesters require moderator, not admin.** Contract decision (they are
   read-only suggestions); TS gated them admin.
6. **Disabled moderators are rejected at login** (401) rather than authenticating and failing
   on every subsequent call as in Convex. Same net access (none), clearer UX.
7. **Password reset is token-link based** (Devise standard) instead of the Convex
   code-entry flow. The SPA's reset form accepts the token from the email link.
8. **Dashboard "charts"**: the TS `DashboardPage` contained an unrendered `StackedBarChart`
   (dead code — it was never referenced) and no recharts usage; the Rails port keeps the
   actually-rendered dashboard (stat cards, daily aggregates via `dailyData`, recent activity,
   rule performance) and deletes the dead code so `tsc --noEmit` passes.
9. **Inert rule-config keys** (`customCheck`, `requireBothFields`, `exceptionLists`,
   `excludeBodyKeywords`, `createdBeforeYear`, `excludeTitleListRef`, `minConfidence`) are
   accepted but ignored — exactly like the TS engine, which never reads them (verified while
   building the golden suite).
10. **`deleteAccount` remains a no-op** (sign-out only) — parity with the TS placeholder.
11. **Implio submissions default to stub mode** (`IMPLIO_STUB` unset ⇒ ON) so a fresh boot
    can't post to the real moderation platform by accident.
12. **IDs are integer strings** (`"42"`) instead of Convex opaque IDs — serialized as `_id`
    strings so the frontend is unaffected.

## Verification environment caveats (see MIGRATION_STATUS.md)

- This sandbox blocks `www.jamesedition.com`, `img.jamesedition.com` and `api.openai.com`
  ("Host not in allowlist") and has no AI keys: live JE fetch and live AI calls are
  implemented and WebMock-tested, but e2e uses `docker-compose.e2e.yml` (mock JE API) and
  criterion 4 is "verified mocked only".
- Docker Hub anonymous pulls are rate-limited here: images default to `mirror.gcr.io`
  (override `BASE_REGISTRY=docker.io`), and `docker/extra-ca-certs/` carries the sandbox
  proxy CAs (inert elsewhere; delete if unwanted).

## Where things live

- Rule engine (pure Ruby, DB-free): `rails/app/services/moderation/` — golden parity suite
  in `rails/spec/services/moderation/golden_spec.rb`, fixtures generated from the actual TS
  by `bun scripts/golden/generate.ts` (see `scripts/golden/README.md`).
- Moderation orchestration: `Moderation::Runner`; JE fetch: `Listings::JeClient` /
  `Listings::FetchAndModerate`; AI: `Ai::*`; Implio: `Integrations::ImplioClient`;
  jobs: `app/jobs/` (Solid Queue).
- API: `rails/app/controllers/api/`, serialization `rails/app/serializers/convex_doc.rb`,
  contract `docs/rails_api_contract.md`.
- Frontend data layer: `src/lib/apiClient.ts`, `src/hooks/useApiQuery.ts`,
  `src/contexts/AuthContext.tsx`.
- E2E: `scripts/e2e/rails_e2e.ts` (+ mock JE server, compose overlay).
