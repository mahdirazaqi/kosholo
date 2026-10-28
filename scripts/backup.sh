#!/usr/bin/env bash
# Backs up the database (pg_dump, custom format, compressed) and the uploads
# volume into ./backups/YYYY-MM-DD_HHMM/, keeping the newest 7 backups.
# Usage: scripts/backup.sh               (KEEP_BACKUPS=14 scripts/backup.sh to keep more)
#        scripts/backup.sh --skip-files  photos, videos, voice and avatars only:
#                                        leaves out sent files (documents, up to
#                                        MAX_FILE_SIZE_MB each), which can make the
#                                        archive huge. Back those up less often.
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_FILES=0
for arg in "$@"; do
  case "$arg" in
    --skip-files) SKIP_FILES=1 ;;
    *) echo "✗ Unknown option: $arg (see the top of $0)" >&2; exit 1 ;;
  esac
done

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)
KEEP="${KEEP_BACKUPS:-7}"
DEST="backups/$(date +%Y-%m-%d_%H%M)"

[[ -f "$ENV_FILE" ]] || { echo "✗ $ENV_FILE not found (run from the project folder)" >&2; exit 1; }
mkdir -p "$DEST"
trap 'echo "✗ Backup FAILED; removing incomplete $DEST" >&2; rm -rf "$DEST"' ERR

echo "→ Dumping the database…"
"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6' > "$DEST/db.dump"
# A dump that pg_restore can't read is not a backup.
"${COMPOSE[@]}" exec -T db pg_restore --list < "$DEST/db.dump" > /dev/null

# A one-off container from the app image with the uploads volume (works whether
# or not the app is running). Unfinished uploads (tmp/, upload-sessions/) are
# never backed up.
# Sent files are stored as yyyy/mm/{uuid} with no extension, while media,
# avatars and every thumbnail have one, so --skip-files keeps names with a dot.
if [[ $SKIP_FILES == 1 ]]; then
  echo "→ Archiving uploads (without sent files)…"
  "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh app -c \
    'cd /app/uploads && find . \( -path ./tmp -o -path ./upload-sessions \) -prune -o -type f -name "*.*" -print | tar -czf - -T -' > "$DEST/uploads.tar.gz"
else
  echo "→ Archiving uploads…"
  "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint tar app -czf - -C /app/uploads --exclude=./tmp --exclude=./upload-sessions . > "$DEST/uploads.tar.gz"
fi
gzip -t "$DEST/uploads.tar.gz"

(cd "$DEST" && sha256sum db.dump uploads.tar.gz > SHA256SUMS)
trap - ERR

# Keep only the newest $KEEP backups.
mapfile -t old < <(find backups -mindepth 1 -maxdepth 1 -type d | sort | head -n -"$KEEP")
for dir in "${old[@]}"; do rm -rf "$dir"; done

echo
echo "✓ Backup complete: $DEST"
echo "  database: $(du -h "$DEST/db.dump" | cut -f1)   uploads: $(du -h "$DEST/uploads.tar.gz" | cut -f1)"
echo "  kept $(find backups -mindepth 1 -maxdepth 1 -type d | wc -l) backup(s); removed ${#old[@]} old one(s)"
echo "  Copy it off this server too (see DEPLOY.md)."
