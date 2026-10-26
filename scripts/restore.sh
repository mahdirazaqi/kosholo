#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh: replaces the database and the
# uploads, then starts the app again.
# Usage: scripts/restore.sh backups/2026-01-31_0400
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)
SRC="${1:-}"

if [[ -z "$SRC" || ! -f "$SRC/db.dump" || ! -f "$SRC/uploads.tar.gz" ]]; then
  echo "Usage: scripts/restore.sh <backup-folder>   (it must contain db.dump and uploads.tar.gz)" >&2
  exit 1
fi
[[ -f "$ENV_FILE" ]] || { echo "✗ $ENV_FILE not found" >&2; exit 1; }
if [[ -f "$SRC/SHA256SUMS" ]]; then
  (cd "$SRC" && sha256sum --quiet -c SHA256SUMS) || { echo "✗ Checksums don't match; backup is damaged" >&2; exit 1; }
fi

echo "This REPLACES the current database and all uploaded files with: $SRC"
read -r -p "Type 'yes' to continue: " answer
[[ "$answer" == "yes" ]] || { echo "Cancelled."; exit 1; }

echo "→ Stopping the app…"
"${COMPOSE[@]}" stop app

echo "→ Waiting for the database…"
"${COMPOSE[@]}" up -d db
for _ in $(seq 1 60); do
  "${COMPOSE[@]}" exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /dev/null 2>&1 && break
  sleep 2
done

echo "→ Restoring the database…"
"${COMPOSE[@]}" exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error' \
  < "$SRC/db.dump"

echo "→ Restoring uploads…"
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh app -c \
  'find /app/uploads -mindepth 1 -delete && tar -xzf - -C /app/uploads' \
  < "$SRC/uploads.tar.gz"

echo "→ Starting the app…"
"${COMPOSE[@]}" up -d
"$(dirname "$0")/wait-healthy.sh"
echo "✓ Restore complete from $SRC"
