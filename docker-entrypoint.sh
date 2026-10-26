#!/bin/sh
# Container start: apply pending migrations, then hand PID 1 to Node (exec)
# so SIGTERM from `docker stop` reaches the server's graceful shutdown.
set -eu

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%S.000Z) INFO  [entrypoint] $*"; }

log "applying database migrations"
node node_modules/prisma/build/index.js migrate deploy

log "starting server"
exec node dist/server.mjs
