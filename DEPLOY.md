# Deploying FeedLens Moderation

The whole stack (Postgres, Rails API, Solid Queue worker, SPA, HTTPS) runs from docker
compose on a single small server. Total hands-on time: ~10 minutes.

## 1. Get a server

Any Ubuntu 22.04/24.04 VM with 2 GB+ RAM and Docker works. Options, simplest first:

- **Hetzner Cloud CX22** (~€4/mo) or **DigitalOcean Basic 2GB** (~$12/mo) — create the
  server, pick Ubuntu 24.04, add your SSH key.
- **AWS EC2** `t3.small` — if JamesEdition standardizes on AWS, ask your infra team for an
  instance + security group allowing inbound 22/80/443.
- Internal JE infra — hand this file to whoever runs it.

Open inbound ports **22, 80, 443**. Everything else stays closed (the app port binds to
localhost only in the prod config).

## 2. Point DNS at it

Create an A record, e.g. `feedlens.jamesedition.com → <server IP>`. HTTPS certificates are
issued automatically (Caddy + Let's Encrypt) once this resolves.

## 3. Install Docker and clone

```bash
ssh root@<server-ip>
curl -fsSL https://get.docker.com | sh
git clone https://github.com/timur-cell/feedlens_moderation.git
cd feedlens_moderation
```

(Private repo: use a fine-grained personal access token or deploy key.)

## 4. Configure

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in at minimum: `DOMAIN`, `SECRET_KEY_BASE` (`openssl rand -hex 64`),
`DATABASE_PASSWORD`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`.
The LAS webhook stays disabled
until you set `LAS_PUSH_API_KEY` (planned for later).

## 5. Boot

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes. Then open `https://<your-domain>` and log in with
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. The database is migrated and seeded automatically
(81 rules / 22 lists / 8 templates / settings / admin).

## 6. Import production data

Get a fresh export from Viktor's bot, then:

```bash
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml \
  cp feedlens_prod_export.zip web:/tmp/export.zip
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml \
  exec web bin/rails "convex:import[/tmp/export.zip]"
```

Idempotent — safe to re-run with a newer export at any time. Imported moderators get
random passwords; set real ones in **Settings → Team** (or configure `SMTP_*` for
self-service reset).

## 7. Post-boot checklist

- Run one **Moderate by URL** with a real JE listing URL (verifies live JE API access).
- Run one **image analysis** on the Image Recognition page (verifies the Anthropic key).

## Enabling the LAS feed later

Set `LAS_PUSH_API_KEY` in `.env.production` (e.g. `openssl rand -hex 24`), re-run the
`up -d` command, and point the LAS pipeline at `https://<domain>/api/push-flagged` with
that key in the `X-Api-Key` header. Until the key is set, the endpoint rejects all
requests with 401.

## Operations

**Update to latest code**
```bash
git pull
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Logs** — `docker compose ... logs -f web jobs`

**Database backup** (add to cron, e.g. daily):
```bash
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T db pg_dump -U postgres feedlens_production | gzip > backup_$(date +%F).sql.gz
```

**Restore**
```bash
gunzip -c backup_YYYY-MM-DD.sql.gz | docker compose ... exec -T db psql -U postgres feedlens_production
```

## Notes

- `docker/extra-ca-certs/` contains CA certs only needed by the sandboxed CI this was built
  in; they're inert on a normal server (delete the `.crt` files if you prefer).
- The compose images default to `mirror.gcr.io` (Docker Hub mirror). On a normal server you
  can set `BASE_REGISTRY=docker.io` in `.env.production` — both work.
- Mail: without `SMTP_*`, password-reset emails are disabled; admins set passwords from the
  Users page instead.
