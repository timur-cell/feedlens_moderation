# FeedLens Moderation

Listing-moderation tool for [JamesEdition](https://www.jamesedition.com). A rules
engine (plus optional LLM vision passes) reviews marketplace listings, and moderators
triage the results through a web UI.

The backend was migrated from Convex to a Rails JSON API. The `convex/` directory is
kept on purpose — see [Why `convex/` is still here](#why-convex-is-still-here).

## Stack

- **Backend** — Rails 8 JSON API + PostgreSQL 16, in [`rails/`](rails/). Solid Queue for
  background jobs, Devise for auth. REST contract: [`docs/rails_api_contract.md`](docs/rails_api_contract.md).
- **Frontend** — React 19 + Vite SPA at the repo root (`src/`), Tailwind v4 + shadcn/ui,
  built and managed with [Bun](https://bun.sh).

The SPA talks to Rails over `/api` (and `/image-proxy` for listing images). In dev, Vite
proxies both to `localhost:3000` (see [`vite.config.mjs`](vite.config.mjs)).

## Run locally

You need **PostgreSQL 16** reachable at `127.0.0.1:5432` (user/password `postgres`),
**Ruby 3.3.6**, and **Bun**.

**1. Backend** (Rails API on `:3000`):

```bash
cd rails
bundle install
bin/rails db:setup     # create DB, migrate, seed (rules, lists, templates, admin user)
bin/rails server       # http://localhost:3000
```

`db:setup` seeds an admin login — default `admin@feedlens.local` / `FeedLens!2026`
(override with `ADMIN_EMAIL` / `ADMIN_PASSWORD`). See [`rails/README.md`](rails/README.md)
for the full backend reference, env vars, and the `convex:import` data-import task.

**2. Frontend** (Vite dev server, separate terminal at the repo root):

```bash
bun install
bun run dev            # http://localhost:5173, proxies /api → :3000
```

Prefer containers? `docker compose up --build` boots the whole stack (Postgres, Rails,
worker, SPA behind nginx) on `http://localhost:8080` — details in
[`rails/README.md`](rails/README.md).

## Environment

- **Frontend** — copy [`.env.example`](.env.example) to `.env.local`. The only vars the
  SPA reads are `VITE_API_BASE`, `VITE_IS_PREVIEW`, and the optional
  `VITE_TEST_USER_EMAIL` / `VITE_TEST_USER_PASSWORD`.
- **Backend** — see [`rails/.env.example`](rails/.env.example) (local) and
  [`.env.production.example`](.env.production.example) (production / docker compose).

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server |
| `bun run build` | Production build (`dist/`) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check` / `bun run format` / `bun run lint` | Biome |
| `bun run golden` | Regenerate the rule-engine parity fixtures (see below) |

## Tests

```bash
cd rails && bundle exec rspec     # backend suite (request specs, jobs, golden fixtures)
bun run typecheck && bun run build
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the Rails suite
(rspec / rubocop / brakeman / bundler-audit) and the frontend typecheck + build on every
PR and push to `main`.

## Deploy

Production runs the VPS auto-updater: **merge to `main` → it auto-deploys**. The manual
docker-compose setup (first provision, DNS, HTTPS, ops) is documented in
[`DEPLOY.md`](DEPLOY.md). Project state and migration history live in
[`HANDOFF.md`](HANDOFF.md) and [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md).

## Why `convex/` is still here

The Convex backend is gone, but [`convex/moderation.ts`](convex/moderation.ts) remains the
**oracle** for the Ruby rule engine. `scripts/golden/generate.ts` (`bun run golden`)
executes that original TypeScript evaluator to regenerate the golden parity fixtures that
[`rails/spec/services/moderation/golden_spec.rb`](rails/spec/services/moderation/golden_spec.rb)
asserts against. Do **not** delete `convex/` or the `convex` / `@convex-dev/auth`
dependencies — see [`scripts/golden/README.md`](scripts/golden/README.md).
