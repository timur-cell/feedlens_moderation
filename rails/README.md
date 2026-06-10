# FeedLens Moderation — Rails backend

Rails 8 + PostgreSQL replacement for the Convex backend in `../convex/`. The React SPA in
`../src/` talks to this app through the REST JSON API described in `../docs/rails_api_contract.md`.

## Quick start (docker compose — recommended)

From the repo root, on a fresh clone:

```bash
docker compose up --build
```

That boots four services:

| Service | What it runs |
|---|---|
| `db` | PostgreSQL 16 |
| `web` | Rails API (`bin/rails server` behind Thruster); on boot runs `db:prepare` + `db:seed` |
| `jobs` | Solid Queue worker (`bin/jobs`) |
| `frontend` | nginx serving the built SPA, proxying `/api` + `/image-proxy` to `web` |

Then open **http://localhost:8080** and log in with the seeded admin
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`, default `admin@feedlens.local` / `FeedLens!2026`).

Seeding creates: 81 moderation rules, 22 moderation lists, 8 message templates, the default
settings row, and the admin user. Seeds are idempotent (safe to re-run).

> Base images use `mirror.gcr.io/library/*` (Google's mirror of Docker Hub official images)
> to dodge anonymous Docker Hub rate limits. Set `BASE_REGISTRY=docker.io` to override.

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@feedlens.local` / `FeedLens!2026` | Seeded admin login |
| `DEFAULT_USER_PASSWORD` | `FeedLens!2026` | Password for admin-created users when none given |
| `LAS_PUSH_API_KEY` | `dev-las-push-key` | Auth for `POST /api/push-flagged` |
| `IMPLIO_STUB` | `true` | Log Implio submissions instead of POSTing |
| `IMPLIO_API_KEY` | — | Implio API key (used when `IMPLIO_STUB=false`) |
| `ANTHROPIC_API_KEY` | — | Claude vision + param scans |
| `OPENAI_API_KEY` | — | GPT-4o fallback vision |
| `SECRET_KEY_BASE` | insecure default | Set a real one outside local use |
| `DATABASE_*` | postgres/postgres | DB connection |
| `SMTP_*` | — | Devise password-reset mail (see `config/environments/production.rb`) |

## Local development (without docker)

Requirements: Ruby 3.3.6, PostgreSQL 16 reachable at `127.0.0.1:5432` (user/password `postgres`).

```bash
cd rails
bundle install
bin/rails db:setup        # creates DB, runs all migrations, seeds everything listed above
bin/rails server          # API on http://localhost:3000
```

Frontend dev server (separate terminal, repo root): `npm run dev` — Vite proxies `/api` and
`/image-proxy` to `localhost:3000`.

## Tests

```bash
cd rails
bundle exec rspec         # full suite (golden rule-engine fixtures, request specs, jobs — no live AI calls)
bundle exec rubocop       # omakase style
```

Golden rule-engine fixtures live in `spec/fixtures/golden/expected.json`, generated from the
original TypeScript implementation — see `../scripts/golden/README.md` to regenerate.

## Importing production data

See `HANDOFF.md` at the repo root: `bin/rails convex:import[path/to/export.zip]` ingests a
`npx convex export` ZIP.
