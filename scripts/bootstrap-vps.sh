#!/usr/bin/env bash
# FeedLens Moderation — one-shot VPS bootstrap.
#
# On a fresh Ubuntu/Debian server, as root:
#
#   curl -fsSL https://raw.githubusercontent.com/timur-cell/feedlens_moderation/main/scripts/bootstrap-vps.sh | bash
#
# What it does: installs Docker if missing, clones the repo to /opt/feedlens,
# generates all secrets into .env.production (only on the first run), boots the
# full stack with HTTPS (Caddy + Let's Encrypt on a <ip>.sslip.io hostname when
# no domain is given), waits for health, then prints the URL and credentials.
#
# Options via environment variables:
#   FEEDLENS_DOMAIN=feedlens.example.com   use a real domain (DNS must point here)
#   ANTHROPIC_API_KEY=sk-ant-...           enable AI features right away
#
# Re-running is safe: secrets are kept, code is updated, stack is rebuilt.
set -euo pipefail

REPO_URL="https://github.com/timur-cell/feedlens_moderation.git"
APP_DIR="/opt/feedlens"
ENV_FILE="$APP_DIR/.env.production"
COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.yml -f docker-compose.prod.yml"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo -i)."; exit 1; }

say "Installing prerequisites"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git openssl ca-certificates >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

say "Fetching code into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin main && git -C "$APP_DIR" reset -q --hard origin/main
else
  git clone -q "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  say "Generating secrets (first run)"
  PUBLIC_IP=$(curl -4fsS https://api.ipify.org || hostname -I | awk '{print $1}')
  DOMAIN="${FEEDLENS_DOMAIN:-${PUBLIC_IP}.sslip.io}"
  # Pick a free internal port for the frontend (8080 may be taken by other containers)
  APP_PORT=8080
  while ss -ltn 2>/dev/null | grep -q ":$APP_PORT "; do APP_PORT=$((APP_PORT + 10)); done
  ADMIN_PASSWORD=$(openssl rand -hex 9)
  cat > "$ENV_FILE" <<ENV
DOMAIN=$DOMAIN
SECRET_KEY_BASE=$(openssl rand -hex 64)
DATABASE_PASSWORD=$(openssl rand -hex 16)
ADMIN_EMAIL=admin@feedlens.local
ADMIN_PASSWORD=$ADMIN_PASSWORD
# LAS integration disabled for now: the /api/push-flagged endpoint rejects
# all requests until LAS_PUSH_API_KEY is set here.
LAS_PUSH_API_KEY=
APP_BIND=127.0.0.1
APP_PORT=$APP_PORT
IMPLIO_STUB=true
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ENV
  chmod 600 "$ENV_FILE"
else
  say "Keeping existing $ENV_FILE"
  # Allow adding/refreshing the AI key on re-runs
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" "$ENV_FILE"
  fi
fi
DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)

say "Building and starting the stack (first build takes a few minutes)"
$COMPOSE up -d --build

say "Waiting for the app to become healthy"
for i in $(seq 1 60); do
  if curl -fsk "https://$DOMAIN/up" >/dev/null 2>&1; then HEALTH=https; break; fi
  if curl -fs "http://127.0.0.1:$(grep '^APP_PORT=' "$ENV_FILE" | cut -d= -f2)/up" >/dev/null 2>&1; then HEALTH=local; fi
  sleep 5
done

ADMIN_EMAIL=$(grep '^ADMIN_EMAIL=' "$ENV_FILE" | cut -d= -f2)
ADMIN_PASSWORD=$(grep '^ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2)

echo
echo "──────────────────────────────────────────────────────────────"
if [ "${HEALTH:-}" = "https" ]; then
  echo "  FeedLens is LIVE:   https://$DOMAIN"
else
  echo "  App is up locally; HTTPS may still be provisioning."
  echo "  Try in a minute:    https://$DOMAIN"
  echo "  Diagnose with:      cd $APP_DIR && $COMPOSE logs caddy web | tail -50"
fi
echo
echo "  Login:              $ADMIN_EMAIL"
echo "  Password:           $ADMIN_PASSWORD"
echo "  Config:             $ENV_FILE   (chmod 600)"
echo
echo "  Next steps:"
echo "   - Import prod data:  scp export.zip root@$DOMAIN:/tmp/ then"
echo "       cd $APP_DIR && $COMPOSE cp /tmp/export.zip web:/tmp/export.zip \\"
echo "         && $COMPOSE exec web bin/rails 'convex:import[/tmp/export.zip]'"
echo "   - Enable AI:  set ANTHROPIC_API_KEY in $ENV_FILE, then"
echo "       cd $APP_DIR && $COMPOSE up -d"
echo "──────────────────────────────────────────────────────────────"
