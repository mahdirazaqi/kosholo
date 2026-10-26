@AGENTS.md

# Kosholo (کوشولو)

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
src/proxy.ts          route protection (Next 16's renamed middleware)
src/app/              root layout (providers only), globals.css, fonts/ (self-hosted Vazirmatn)
src/app/(auth)/       /login, /register (centered card, no bottom nav) + actions.ts (all auth Server Actions)
src/app/(app)/        protected app: layout renders AppShell (header + bottom nav); /, /contacts, /profile
src/components/       app components (app-shell, bottom-nav, form-field, password-input, submit-button, ...)
src/components/auth/  login/register forms, auth card
src/components/profile/ profile forms + logout dialog
src/components/ui/    shadcn components (RTL-audited)
src/generated/prisma/ generated Prisma client (do not edit)
src/hooks/            client hooks (use-socket, use-form-feedback)
src/lib/              db.ts, session.ts, auth.ts, rate-limit.ts, form.ts, validations/, socket.ts, utils.ts
src/server/           custom server: index.ts (entry), io.ts (getIO/setIO), socket.ts (event handlers)
```

## Auth

Custom email/password auth. Do not add NextAuth or other auth libraries.

- **Passwords:** bcryptjs, cost 12. Never store, return or log plain passwords. `passwordHash` must never leave the server.
- **Session:** an HS256 JWT signed with `jose` (`JWT_SECRET`), with only the user id in `sub`. It's stored in the httpOnly cookie `session` (30 days, `sameSite: lax`, `secure` in production).
- **`src/lib/session.ts`:** `createSession(userId)`, `deleteSession()` and `verifySession(token)`. It's edge-safe: jose only and no Prisma, so `proxy.ts` can import it.
- **`src/lib/auth.ts` (server-only):**
  - `getCurrentUser()` verifies the cookie and loads the user. It's wrapped in React `cache()` and selects only public fields.
  - `requireUser()` redirects to `/login` when there's no user.
  - **Call `requireUser()` in every protected page and Server Action.** `proxy.ts` is only an optimistic check of the JWT signature, with no DB.
- **`src/proxy.ts`:**
  - Logged-out users go to `/login?from=<path>`.
  - Logged-in users visiting `/login` or `/register` go to `/`.
  - Add any new public routes to `AUTH_ROUTES`.
- **Cache Components:** reading the session is request-time data. Put components that call `requireUser()`/`getCurrentUser()` inside `<Suspense>`, not at the top level of a layout (see `(app)/profile/page.tsx`).
- **Validation:** zod schemas in `src/lib/validations/` with Persian messages. They're shared by the client (instant feedback) and the Server Actions (the source of truth).
- **Forms:**
  - Server Actions return `FormState` (`src/lib/form.ts`). Field errors, the message and echoed non-secret values go back to the form.
  - Client forms use `useActionState` and `useFormFeedback(schema, state)`, which handles client validation and toasts the `message`.
  - Use `FormField` and `fieldA11y` for labels, errors and aria attributes.
- **Rate limiting:**
  - `src/lib/rate-limit.ts` keeps an in-memory fixed window on `globalThis`, which is valid because there's a single long-running process.
  - Logins allow 5 failures per IP+identifier per 15 minutes. Registrations allow 5 per IP per hour.
  - The client IP comes from `X-Forwarded-For`, which the reverse proxy must set. The custom server fills it from the socket address when it's missing.
- **LTR fields:** email, username and password inputs use `dir="ltr"` + `text-start`. Labels and errors stay RTL.
- **Inputs are always 16px** (`text-base`, also on desktop) so iOS Safari doesn't zoom on focus. `md:text-sm` was removed from `ui/input.tsx` and `ui/textarea.tsx` on purpose.

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
