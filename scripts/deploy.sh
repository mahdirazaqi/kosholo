#!/usr/bin/env bash
# Updates the server to the latest code: pull, build, restart, clean up, and
# wait until the app is healthy (shows the app logs if it isn't).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)
[[ -f "$ENV_FILE" ]] || { echo "✗ $ENV_FILE not found (copy .env.production.example)" >&2; exit 1; }

echo "→ Pulling the latest code…"
caddyfile_before="$(sha256sum Caddyfile)"
git pull --ff-only

echo "→ Building the image…"
"${COMPOSE[@]}" build

echo "→ Starting the new version…"
"${COMPOSE[@]}" up -d --remove-orphans

# git replaces the Caddyfile (new inode), and a single-file bind mount keeps
# showing the old one, so restart Caddy when it changed.
if [[ "$(sha256sum Caddyfile)" != "$caddyfile_before" ]]; then
  echo "→ Caddyfile changed; restarting Caddy…"
  "${COMPOSE[@]}" restart caddy
fi

echo "→ Removing old images…"
docker image prune -f > /dev/null

"$(dirname "$0")/wait-healthy.sh"
echo "✓ Deployed $(git rev-parse --short HEAD)"
