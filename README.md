# Kosholo

A small, lightweight, self-hosted real-time chat app, installable as a PWA.

- Direct and group chats (admins, members, renaming, group photos)
- Photos, videos and voice messages, processed on the server (sharp + ffmpeg)
- Replies, emoji, typing indicators, online presence / last seen, read receipts
- Unread badges, notification sound, offline page, installable on mobile and desktop
- Mobile-first, with a two-column layout on desktop, plus light and dark themes

## Stack

- Next.js 16 (App Router, TypeScript) served by a custom Node server
- Socket.IO on the same server and port (`/socket.io`)
- PostgreSQL 17 with Prisma 7
- Tailwind CSS v4 and shadcn/ui
- Custom auth (bcryptjs + jose JWT in an httpOnly cookie)
- Serwist service worker
- Requires system `ffmpeg` and `ffprobe`

It runs as one long-running Node process, so it's meant for a VPS or Docker, not serverless platforms.

## Quick start

Requirements: Node 24, npm, Docker (for Postgres), and `ffmpeg`/`ffprobe` on your `PATH`.

```bash
cp .env.example .env        # first time only
docker compose up -d        # start Postgres
npm install                 # also runs prisma generate
npm run db:migrate          # apply migrations
npm run dev                 # http://localhost:3000
```

Other commands:

```bash
npm run lint
npm run typecheck           # app + service worker
npm run db:studio           # Prisma Studio
npm run icons               # regenerate PWA icons from public/logo.svg
npm run build               # production build (Next + server bundle + service worker)
npm start                   # run the production build
```

Use npm only (not pnpm, yarn or bun).

## Deployment

See [DEPLOY.md](DEPLOY.md) for a step-by-step production setup with Docker Compose, Caddy (automatic HTTPS), backups and updates.
