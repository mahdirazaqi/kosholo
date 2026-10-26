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

- Directional icons (chevrons, arrows) get `rtl:rotate-180`. Icons that should mirror rather than flip (e.g. the send icon) get `rtl:-scale-x-100`.
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
src/app/(app)/(tabs)/ protected tabs, AppShell with bottom nav: / , /contacts (+ actions.ts), /profile
src/app/(app)/chats/  protected conversation screens, AppShell without bottom nav: /chats/[conversationId]
src/components/       app components (app-shell, page-header, bottom-nav, bottom-sheet, user-avatar, back-button, form-field, ...)
src/components/contacts/ contacts list, contact sheet, add-contact sheet
src/components/chat/  chat list, new-chat sheet, chat view, message list/bubble, composer, emoji button
src/components/auth/  login/register forms, auth card
src/components/profile/ profile forms + logout dialog
src/components/ui/    shadcn components (RTL-audited)
src/generated/prisma/ generated Prisma client (do not edit)
src/hooks/            client hooks (use-conversation-realtime, use-presence, use-now, use-form-feedback, use-media-query, use-visual-viewport-height)
src/lib/              db.ts, session.ts, session-token.ts, auth.ts, users.ts, contacts.ts, rate-limit.ts, form.ts, validations/, format-date.ts, emoji.ts, client-utils.ts, utils.ts
src/lib/realtime/     events.ts (typed event contract + rooms), membership.ts (cached), emit.ts (from Server Actions)
src/lib/realtime/client/ socket.ts (typed client), store.ts (zustand), merge.ts (dedupe rule)
src/lib/chat/         server chat queries: queries.ts (selects + mappers), conversations.ts, messages.ts, limits.ts
src/lib/types/chat.ts shared chat types (ChatMessage, ConversationListItem, ...)
public/emojibase/     self-hosted emoji data for the picker (no CDN)
src/server/           custom server: index.ts (entry), env.ts (loads .env first), io.ts (getIO/setIO/tryGetIO)
src/server/socket/    index.ts (handlers), auth.ts (handshake), presence.ts
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
- **Cache Components:** reading the session is request-time data. Put components that call `requireUser()`/`getCurrentUser()` inside `<Suspense>`, not at the top level of a layout (see `(app)/(tabs)/profile/page.tsx`).
  - Under Cache Components the static shell streams first, so `notFound()` from a request-time check shows the not-found page with `noindex` but an HTTP 200. That's accepted. A real 404 status would need the check in `proxy.ts`.
  - Client components in the shell that read URL data (`usePathname`, `useSearchParams`) break the build on dynamic routes unless they're behind `<Suspense>`. That's why `/chats` uses its own layout without `BottomNav`.
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

## Layout conventions

- `AppShell` is the app frame: a centered column on desktop with a scrollable `main`. Pass `nav` to show the bottom navigation.
- Each page renders its own sticky `PageHeader` (title, subtitle, `start`/`end` slots).
- Use `UserAvatar` for avatars, which shows initials with a deterministic tint. Use `BottomSheetContent` for bottom sheets.
- Display a username inside RTL text as `<bdi dir="ltr">@{username}</bdi>` so it stays aligned with the RTL line. Only inputs get `dir="ltr"` + `text-start`.

## Users, contacts and conversations

- **Public user shape:** `{ id, name, username, avatarUrl }` (`publicUserSelect` / `PublicUser` in `src/lib/users.ts`). This is the only user data that may reach another user's browser. Never select email or other private fields for other users, including in props passed to Client Components.
- **Contacts are one-directional,** like Telegram: adding someone only puts them in my list. Adding an existing contact is a no-op.
- **Lookup is exact match only** on username or email, never partial and never a listing, so the user base can't be enumerated.
  - Input is normalized by `userLookupSchema` (trim, lowercase, strip a leading `@`).
  - Lookups are rate limited to 30 per user per 10 minutes.
  - You can't add yourself.
- **Direct conversations:**
  - `Conversation.directKey` holds the two user ids sorted and joined with `:` (`directKeyFor()` in `src/lib/conversations.ts`). It's null for groups.
  - Its unique index guarantees one DIRECT conversation per pair.
  - `startDirectConversation` upserts by `directKey` in a transaction, adds both users as MEMBER, retries a lost race (P2002) by reading the existing row, then redirects to `/chats/[id]`.
- **Access to a conversation goes through `getConversationForMember(id, userId)`** (pages) or `isMember(id, userId)` (actions), both in `src/lib/chat/conversations.ts`. They return null/false for non-members and malformed ids. Pages then call `notFound()`; actions return an error (or `null`).

## Chat

- **Shapes:** `src/lib/types/chat.ts`.
  - `ChatMessage` has `id, conversationId, type, content, mediaUrl, createdAt` (ISO string), `sender` (a `PublicUser`), `replyTo` (`ReplyPreview | null | "deleted"`), and client-only `status` (`sending | sent | failed`) plus `tempId`.
  - `ConversationListItem` has `id, type, title, avatarUrl, otherUser, lastMessage {type, content, isMine}, lastMessageAt, unreadCount`.
  - `ChatConversation` is the chat screen header data. `MessagesPage` is `{ messages (oldest → newest), nextCursor }`.
- **Queries** (server-only, `src/lib/chat/`):
  - Always select with `messageSelect` / `conversationSelect` and map with `toChatMessage()` (`queries.ts`), so every query returns the same shape and never private user fields.
  - `getConversations(userId)` returns only conversations with at least one message, sorted by `updatedAt`. Unread counts come from one raw SQL query: messages from others after `lastReadAt`.
  - `getMessages(conversationId, cursor?)` pages 40 at a time, newest first from the DB, returned oldest → newest. `cursor` is the id of the oldest loaded message. It does **not** check membership, so callers must.
- **Actions** (`src/app/(app)/chats/actions.ts`):
  - `sendMessage({ conversationId, content, replyToId? })`: zod-validated (trim, 1–4000 chars), checks membership, requires `replyToId` to be in the same conversation, and is rate limited to 60/min per user. In one transaction it creates the message, bumps `conversation.updatedAt` and sets the sender's `lastReadAt`. Returns `{ ok, message }`.
  - `markAsRead(conversationId)` and `loadOlderMessages(conversationId, cursor)`.
  - Chat actions call `revalidatePath("/")` so the chat list refetches on the next visit, without re-rendering the open chat.
- **Client** (`src/components/chat/`):
  - `ChatView` owns the message state. Sending is optimistic: a temp message with `status: "sending"` and `tempId` is replaced by the server message (which keeps `tempId` so the React key is stable) or marked `failed` with a retry.
  - `MessageList` handles scroll anchoring (opens at the bottom, prepends older pages without a jump, follows new messages), day separators, 5-minute grouping, the scroll-to-bottom button and jumping to quotes (loads up to 10 older pages).
  - `MessageBubble` handles swipe-to-reply and long-press (touch), the hover menu (desktop), quotes, status and emoji-only messages.
  - The sender name line is already wired for `GROUP` conversations.
  - Desktop vs touch is `useIsDesktop()` (`(hover: hover) and (pointer: fine)`): Enter-to-send, hover menus and an emoji popover vs a bottom sheet.
- **Dates:** use `src/lib/format-date.ts` only.
  - Everything is formatted in the fixed `Asia/Tehran` zone with the Persian calendar and digits, so SSR and hydration match.
  - Day/yesterday logic uses `dayNumber()`.
- **Keyboard:** the viewport has `interactive-widget=resizes-content` (Android). `useVisualViewportHeight()` sets `--app-height` from `visualViewport` for iOS, and `AppShell` uses it. In the chat, the message list is the only scroll area.
- **Emoji picker:** the frimousse-based shadcn `ui/emoji-picker.tsx`. Data is self-hosted in `public/emojibase/en`, with Persian category names in `messages.json`; search is English because emojibase has no Persian. Don't point it at a CDN (jsDelivr is often blocked in Iran).
- **Reply deletion:** `Message.replyTo` is `onDelete: SetNull`, so a deleted original currently drops the link. `"deleted"` is rendered as «پیام در دسترس نیست» for when message deletion lands.

## Realtime (Socket.IO)

One process: Socket.IO is attached to the custom server.
- **Shared instances:** the io instance, the Prisma client, the membership cache and the rate limiter are all shared through `globalThis`. Next bundles and the custom server load separate copies of the same modules.
- **No `server-only` in socket code:** `src/server/socket/*` and everything it imports (`db.ts`, `session-token.ts`, `lib/realtime/*`) must not import `"server-only"` or `next/headers`. The custom server runs in plain Node, where `server-only` throws.
- **Server bundle format:** the server bundle is ESM (`dist/server.mjs`), because the generated Prisma client uses `import.meta.url`.
- **Env loading:** `.env` is loaded by `src/server/env.ts` (`process.loadEnvFile`), which must stay the first import of `src/server/index.ts`.

**Event contract:** `src/lib/realtime/events.ts` defines every event name, payload type and room helper, typed through Socket.IO's generics on both sides. Add new events there.

| Direction | Event | Payload | Delivered to |
|---|---|---|---|
| S→C | `session:ready` | `{ userId }` | the socket, after auth |
| S→C | `message:new` | `{ message: ChatMessage, tempId }` | `user:{id}` of **every** member (incl. sender's other tabs) |
| S→C | `conversation:read` | `{ conversationId, userId, lastReadAt }` | `user:{id}` of every member |
| S→C | `typing:start` / `typing:stop` | `{ conversationId, userId, name }` | `user:{id}` of the other members |
| S→C | `presence:update` | `{ userId, online, lastSeenAt }` | `presence:{userId}` |
| C→S | `conversation:join` (ack `{ ok }`) / `conversation:leave` | `conversationId` | joins/leaves `conv:{id}` after a membership check |
| C→S | `typing:start` / `typing:stop` | `conversationId` | membership-checked; `start` ignored if faster than 1/s per socket |
| C→S | `presence:subscribe` (ack: states) / `presence:unsubscribe` | `{ userIds }` | joins `presence:{id}`; only for people I share a conversation with or have as contacts |

**Rooms** (`userRoom`, `conversationRoom`, `presenceRoom`):
- `user:{id}`: every socket of a user, joined on connect. All per-user delivery goes here.
- `conv:{id}`: sockets with that chat open.
- `presence:{id}`: watchers of a user's status.

Typing goes to user rooms rather than `conv:{id}` so the chat list can show it too.

**Auth:** the handshake reads the httpOnly `session` cookie and verifies it with `verifySession` (`session-token.ts`), then sets `socket.data.userId` and `socket.data.name`. Invalid or missing sessions are rejected with `unauthorized`.

**Membership:** every client event that names a conversation is checked with `isConversationMember` (`lib/realtime/membership.ts`). It has a 60s in-memory TTL; call `invalidateMembership(id)` when members change.

**Emitting from Server Actions:** use `emitToMembers(conversationId, event, payload)` (`lib/realtime/emit.ts`). It's a no-op without a socket server, so mutations never fail because of realtime.
- `sendMessage` emits `message:new` plus `conversation:read` for the sender.
- `markAsRead` emits `conversation:read`.

**Dedupe rule** (`lib/realtime/client/merge.ts`, `mergeMessage`): a message is identified by its server id.
1. Already present by id → ignored.
2. Matches an optimistic message by `tempId` → replaced in place, keeping `tempId` as the React key.
3. Otherwise inserted in `createdAt` order.

Both the Server Action response and `message:new` go through it, so either can arrive first and nothing is duplicated. The chat list also ignores a message id it has already applied.

**Client:**
- **Provider:** `RealtimeProvider` (in `src/app/(app)/layout.tsx`) owns the socket for the signed-in app: connect on mount, disconnect on logout/unmount.
  - Its global listeners feed the zustand store (`lib/realtime/client/store.ts`): chat list, `activeConversationId`, typing (5s expiry), presence and `connected`.
  - The store is only mutated in effects and handlers, never during render (it's module-level, so it must stay empty on the server).
- **Chat list:** `ChatListView` renders `store.conversations ?? serverProps`. Server data seeds the store, and a fresh fetch (`listConversations`) replaces it.
  - On `message:new` for an unknown conversation, the row is fetched with `getConversation(id)` and inserted.
  - Unread counts don't grow for the open, visible conversation.
- **Open chat:** `useConversationRealtime` joins `conv:{id}` (and re-joins after reconnects) and delivers `message:new` / `conversation:read` for the conversation.
  - It calls `markAsRead` at most once every 2s, only while `document.visibilityState === "visible"`.
  - After a reconnect, or when the tab becomes visible again, it catches up with `getMessagesSince(id, lastConfirmedAt)`, which also returns the other members' read states.
- **Read receipts:** one check when sent, two when another member's `lastReadAt` ≥ `createdAt` (DIRECT). `ChatConversation.readStates` seeds them.
- **Presence:**
  - Server: an in-memory socket count per user. The first socket triggers `online`. After the last one disconnects there's a 5s grace period, then `User.lastSeenAt` is written and `offline` is emitted.
  - Client: `usePresence(userId)` (ref-counted subscriptions, re-subscribed on reconnect). The header uses `formatLastSeen()` and refreshes every minute.
- **Header subtitle priority:** «در حال اتصال...» (disconnected) → «در حال نوشتن» → «آنلاین» / «آخرین بازدید …».
- **Socket transports:** websocket first with a polling fallback, and default auto-reconnect.

## Commands

```bash
cp .env.example .env        # first time only
docker compose up -d        # start Postgres
npm install                 # also runs prisma generate
npm run db:migrate          # prisma migrate dev (create/apply migrations; needs an interactive terminal)
npm run db:generate         # regenerate Prisma client
npm run db:studio           # Prisma Studio
npm run dev                 # custom server via tsx watch (Next HMR + Socket.IO), http://localhost:3000
npm run lint
npm run build               # prisma generate + next build + esbuild server -> dist/server.mjs
npm start                   # NODE_ENV=production node dist/server.mjs
```

In dev, `tsx watch` restarts the whole server when a file the custom server imports changes (`src/server/**`, `src/lib/db.ts`, `src/lib/realtime/**`, `src/lib/session-token.ts`). UI changes go through Next HMR. Only one `next dev` can run per project directory (Next holds a lock), so stop an old `npm run dev` before starting another.

In a non-interactive shell (e.g. an agent), `prisma migrate dev` refuses to run. Write the migration SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into `prisma/migrations/<timestamp>_<name>/migration.sql`, then apply it with `npx prisma migrate deploy` and `npx prisma generate`.
