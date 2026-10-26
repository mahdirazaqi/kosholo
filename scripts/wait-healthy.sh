#!/usr/bin/env bash
# Waits (up to ~3 minutes) for the app container's healthcheck (/api/health).
# On failure prints the last app logs and exits non-zero.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

echo "→ Waiting for the app to become healthy…"
container="$("${COMPOSE[@]}" ps -q app)"
[[ -n "$container" ]] || { echo "✗ The app container is not running" >&2; "${COMPOSE[@]}" logs --tail=100 app; exit 1; }

for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
  case "$status" in
    healthy) echo "✓ App is healthy"; exit 0 ;;
    exited|dead) break ;;
  esac
  sleep 3
done

echo "✗ The app did not become healthy (status: ${status:-unknown}). Last logs:" >&2
"${COMPOSE[@]}" logs --tail=100 app >&2
exit 1
