#!/usr/bin/env bash
# Pull-based auto-updater (GitOps-style): applies whatever is on origin/main.
#
# One-time install on the server (also applies any pending update immediately):
#
#   cd /opt/feedlens && git fetch -q origin main && git reset -q --hard origin/main \
#     && bash scripts/auto-update.sh --install-cron
#
# A cron entry then runs this script every minute; when origin/main moves, the
# checkout is reset to it and the compose stack is rebuilt. Which overlay to use
# is read from /opt/feedlens/.compose-files (defaults to the Caddy prod overlay;
# write e.g. "-f docker-compose.yml -f docker-compose.traefik.yml" there for
# hosts with an existing Traefik).
set -euo pipefail

APP_DIR=/opt/feedlens
LOCK=/var/lock/feedlens-update.lock
LOG=/var/log/feedlens-update.log

cd "$APP_DIR"
COMPOSE_FILES=$(cat .compose-files 2>/dev/null || echo "-f docker-compose.yml -f docker-compose.prod.yml")

if [ "${1:-}" = "--install-cron" ]; then
  ( crontab -l 2>/dev/null | grep -v 'feedlens/scripts/auto-update.sh' || true
    echo "* * * * * flock -n $LOCK bash $APP_DIR/scripts/auto-update.sh >> $LOG 2>&1" ) | crontab -
  echo "auto-update installed: origin/main is checked every minute (log: $LOG)"
fi

git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "[$(date -Is)] updating $LOCAL -> $REMOTE"
git reset -q --hard origin/main
# shellcheck disable=SC2086
docker compose --env-file "$APP_DIR/.env.production" $COMPOSE_FILES up -d --build
echo "[$(date -Is)] now running $(git rev-parse --short HEAD)"
