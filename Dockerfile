# syntax=docker/dockerfile:1
# Production image: custom Node server (Next.js + Socket.IO) with ffmpeg.
# Debian slim (not Alpine) for sharp and Prisma. Mirrors for Docker Hub /
# npm / Debian can be passed as build args (see .env.production.example).

ARG NODE_IMAGE=node:24.11-trixie-slim

# ---- base: Node + npm registry ----
FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm config set registry "${NPM_REGISTRY}" \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-maxtimeout 120000

# ---- deps: all dependencies (postinstall runs prisma generate) ----
FROM base AS deps
# Only for `prisma generate` (prisma.config.ts reads it); never used at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build: Next.js, the custom server and the service worker ----
FROM deps AS build
COPY . .
RUN npm run build \
 && rm -rf .next/cache \
 && npm prune --omit=dev --no-audit --no-fund

# ---- runner ----
FROM ${NODE_IMAGE} AS runner
ARG APT_MIRROR=
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOST=0.0.0.0 \
    UPLOAD_DIR=/app/uploads

# ffmpeg/ffprobe for video and voice. APT_MIRROR (e.g. http://mirror.example/debian)
# replaces deb.debian.org when that's unreachable.
RUN if [ -n "${APT_MIRROR}" ]; then \
      sed -i "s|http://deb.debian.org/debian|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/uploads \
 && chown node:node /app/uploads

# Only what's needed to run: production node_modules (incl. the Prisma CLI
# for migrations), the Next build, public assets, the compiled server, prisma/.
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
