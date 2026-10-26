@AGENTS.md

# Kosholo (کشولو)

A small, lightweight real-time chat web app (mini WhatsApp/Telegram). Persian UI, fully RTL, mobile-first, and later an installable PWA. Next.js serves the frontend and backend together from one project.

## Ground rules

- **Self-hosted on a VPS with Docker. Never assume serverless** (Vercel, edge, lambdas). Everything runs in one long-running Node process, which Socket.IO needs.
- **UI text is Persian. Code, identifiers and comments are English.**
- **Use npm only.** Do not use pnpm, yarn or bun.
- **No tests for now.**
- Keep dependencies minimal. Auth will be custom (bcryptjs + jose), so no auth libraries.

## RTL rule (whole project)

Use only logical utilities: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/text-end`, `rounded-s/rounded-e`, `border-s/border-e`, `slide-in-from-start/end`.
Never use physical left/right variants: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l/r`, `border-l/r`.

- Directional icons (chevrons, arrows) get `rtl:rotate-180`.
- `SheetContent` takes `side="start" | "end" | "top" | "bottom"` (default `end`).
- The only allowed physical classes are the `data-[side=left|right]` animations in `dropdown-menu.tsx`. Those sides are computed by Radix positioning, not by layout.
- shadcn is configured with `"rtl": true` in `components.json`, so newly added components come out mostly logical. Still audit each one after adding it.

## Stack

- **Next.js 16** (App Router, TypeScript, `src/`, alias `@/*`). `cacheComponents` is enabled. Read the docs in `node_modules/next/dist/docs/` before using unfamiliar APIs.
- **Tailwind CSS v4.** Config is CSS-first in `src/app/globals.css`, and there is no tailwind.config. The default sans font is Vazirmatn (`--font-vazirmatn`).
- **shadcn/ui** (radix-nova style, neutral, CSS variables) with **next-themes** for class-based dark mode, defaulting to the system theme.
- **PostgreSQL 17** in Docker, accessed through **Prisma 7.10** (pinned to the stable line; 8.x was still a release candidate when this was set up):
  - Config lives in `prisma.config.ts`, which loads `.env` via dotenv. The database URL goes there, not in the schema.
  - The generator is `prisma-client`, which outputs to `src/generated/prisma`. That folder is gitignored and is regenerated on `postinstall` and `build`.
  - The client uses the `@prisma/adapter-pg` driver adapter. Import it from `@/lib/db`, never construct `PrismaClient` elsewhere.
- **Socket.IO** is attached to a custom Node server (`src/server/index.ts`) that also serves Next.js, on the same port at path `/socket.io`.

## Folder structure

```
prisma/               schema.prisma + migrations/
prisma.config.ts      Prisma CLI config
src/app/              routes, root layout, globals.css, fonts/ (self-hosted Vazirmatn)
src/components/       app components (app-shell, bottom-nav, theme-provider, ...)
src/components/ui/    shadcn components (RTL-audited)
src/generated/prisma/ generated Prisma client (do not edit)
src/hooks/            client hooks (use-socket)
src/lib/              db.ts (Prisma singleton), socket.ts (socket.io-client singleton), utils.ts
src/server/           custom server: index.ts (entry), io.ts (getIO/setIO), socket.ts (event handlers)
```

## Realtime

- Server code, such as Server Actions and route handlers, emits through `getIO()` from `@/server/io`. The instance lives on `globalThis` because Next bundles and the custom server load separate module copies.
- Socket event handlers live in `src/server/socket.ts`.
- The client uses `getSocket()` from `@/lib/socket` (lazy, `autoConnect: false`) and the `useSocket()` hook, which connects on mount and exposes `connected`.

## Commands

```bash
cp .env.example .env        # first time only
docker compose up -d        # start Postgres
npm install                 # also runs prisma generate
npm run db:migrate          # prisma migrate dev (create/apply migrations)
npm run db:generate         # regenerate Prisma client
npm run db:studio           # Prisma Studio
npm run dev                 # custom server via tsx watch (Next HMR + Socket.IO), http://localhost:3000
npm run lint
npm run build               # prisma generate + next build + esbuild server -> dist/server.cjs
npm start                   # NODE_ENV=production node dist/server.cjs
```

In dev, `tsx watch` restarts only on server-side changes. UI changes go through Next HMR.
