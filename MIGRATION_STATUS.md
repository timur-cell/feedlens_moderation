# FeedLens Rails Migration — Acceptance Status

Live checklist of the acceptance criteria. Updated whenever a criterion flips.

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | `docker compose up` from fresh clone boots stack; `rails db:setup` migrates + seeds (rules, 22 lists, templates, settings row, env admin); steps proven in clean checkout per rails/README.md | ❌ not started | TS seed actually contains **81** rules (spec said 79); TS wins — seeds insert 81 |
| 2 | Schema: all Convex tables with listed indexes; model validations match Convex constraints | 🔄 in progress | |
| 3 | Rule engine parity + golden-fixture suite (≥30 fixtures, expectations generated from TS via bun), green in RSpec | 🔄 in progress | |
| 4 | AI integrations (Claude vision + param scan, GPT-4o fallback) as job classes, defensive parsing parity, WebMock/VCR tests, no live calls in suite | ❌ not started | |
| 5 | Implio submission job, payload parity, `IMPLIO_STUB=true` default ON | ❌ not started | |
| 6 | `POST /api/push-flagged` (contract+dedup+constant-time key) and `GET /image-proxy` (hostname validation) with request specs incl. auth failures + SSRF attempts | ❌ not started | |
| 7 | Full REST API for frontend behind Devise auth + role checks (admin-only → 403 for moderators) | ❌ not started | |
| 8 | All 14 pages work against Rails API (polling where realtime was); Playwright e2e: login as seeded admin, exercise every page, moderate-by-id flow, rules CRUD round-trip — headless against compose stack | 🔄 in progress | frontend data-layer port running |
| 9 | `bundle exec rspec` green; `rubocop` clean (omakase); `tsc --noEmit` clean | ❌ not started | |
| 10 | MIGRATION_STATUS.md all green + HANDOFF.md (env vars, Convex export import rake task, not-migrated list, behavioral differences) | ❌ not started | |

## Environment notes

- Docker Hub anonymous pulls are rate-limited in this environment; base images use
  `mirror.gcr.io/library/*` (byte-identical mirrors of Docker Hub official images).
