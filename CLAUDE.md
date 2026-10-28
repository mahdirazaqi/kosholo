@AGENTS.md

# Kosholo

A small, lightweight real-time chat web app (mini WhatsApp/Telegram). English UI (LTR) for a global audience, mobile-first, and an installable PWA. Next.js serves the frontend and backend together from one project.

## Ground rules

- **Self-hosted on a VPS with Docker. Never assume serverless** (Vercel, edge, lambdas). Everything runs in one long-running Node process, which Socket.IO needs.
- **Everything is English:** UI text, code, identifiers, comments and docs. User content (messages, names) can be in any language, including RTL scripts.
- **Use npm only.** Do not use pnpm, yarn or bun.
- **No tests for now.**
- Keep dependencies minimal. Auth will be custom (bcryptjs + jose), so no auth libraries.

## Direction rule (whole project)

The app is LTR (`<html lang="en" dir="ltr">`), but layout stays direction-agnostic so an RTL locale can be added later.

Use only logical utilities: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/text-end`, `rounded-s/rounded-e`, `border-s/border-e`, `slide-in-from-start/end`.
Never use physical left/right variants: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l/r`, `border-l/r`.

- Directional icons (chevrons, arrows) get `rtl:rotate-180`. Icons that should mirror rather than flip (e.g. the send icon) get `rtl:-scale-x-100`.
- `SheetContent` takes `side="start" | "end" | "top" | "bottom"` (default `end`).
- The only allowed physical classes are the `data-[side=left|right]` animations in `dropdown-menu.tsx`. Those sides are computed by Radix positioning, not by layout.
- `rtl:` variants are no-ops in LTR; keep them so the layout still works if `dir` ever flips.
- shadcn has `"rtl": false` in `components.json`. Audit newly added components and swap any physical classes for logical ones.
- User-generated text (message bodies, quotes, captions) uses `dir="auto"` so Persian/Arabic messages render right-to-left inside the LTR UI.

## Stack

- **Next.js 16** (App Router, TypeScript, `src/`, alias `@/*`). `cacheComponents` is enabled. Read the docs in `node_modules/next/dist/docs/` before using unfamiliar APIs.
- **Tailwind CSS v4.** Config is CSS-first in `src/app/globals.css`, and there is no tailwind.config. The UI uses the system font stack. Self-hosted Vazirmatn (`--font-vazirmatn`) is loaded with a `unicode-range` limited to Arabic script, so it's only downloaded when Persian/Arabic text appears.
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
src/app/              root layout (providers only), globals.css, fonts/ (self-hosted Vazirmatn, Arabic-script fallback)
src/app/(auth)/       /login, /register (centered card, no bottom nav) + actions.ts (all auth Server Actions)
src/app/(app)/(tabs)/ protected tabs, AppShell with bottom nav: / , /contacts (+ actions.ts), /profile
src/app/(app)/chats/  protected conversation screens, AppShell without bottom nav: /chats/[conversationId]
src/components/       app components (app-shell, page-header, bottom-nav, desktop-sidebar, bottom-sheet, user-avatar, empty-state, skeletons, ...)
src/components/pwa/   service-worker registration (+ update toast), install banner / iOS sheet / settings row
src/sw/sw.ts          service worker source (Serwist), own tsconfig (webworker lib)
scripts/              generate-icons.mjs (npm run icons), build-sw.mjs (npm run build:sw)
src/components/contacts/ contacts list, contact sheet, add-contact sheet
src/components/chat/  chat list, new-conversation/new-chat sheets, chat view, message list/bubble, system message, composer, emoji button
src/components/groups/ new-group flow, member picker, group info view, direct info view
src/components/chat/media/ image/video/voice bubbles, upload progress, viewer, attach + preview
src/components/avatar-editor.tsx  change/remove a profile or group photo
src/app/api/upload/   POST: upload + process (Route Handler, auth inside)
src/app/api/media/    GET/HEAD [uploadId] and [uploadId]/thumb: access-checked, Range-aware streaming
src/app/(app)/photo-actions.ts  setProfilePhoto, setGroupPhoto
src/components/auth/  login/register forms, auth card
src/components/profile/ profile forms + logout dialog
src/components/ui/    shadcn components (logical-direction audited)
src/generated/prisma/ generated Prisma client (do not edit)
src/hooks/            client hooks (use-conversation-realtime, use-presence, use-now, use-time-zone, use-form-feedback, use-media-query, use-visual-viewport-height)
src/lib/              db.ts, session.ts, session-token.ts, auth.ts, users.ts, contacts.ts, rate-limit.ts, form.ts, validations/, format-date.ts, numbers.ts, emoji.ts, client-utils.ts, utils.ts
src/lib/pwa/          settings.ts (per-device), install.ts, notification-sound.ts, caches.ts
src/lib/realtime/     events.ts (typed event contract + rooms), membership.ts (cached), emit.ts (from Server Actions)
src/lib/realtime/client/ socket.ts (typed client), store.ts (zustand), merge.ts (dedupe rule)
src/lib/media/        limits.ts (shared), storage.ts, ffmpeg.ts, serialize.ts (no server-only: also used by the custom server);
                      process.ts (sharp/ffmpeg), access.ts, serve.ts, routes.ts (server-only); client/ (prepare, upload, audio-manager)
src/lib/chat/         queries.ts (selects + mappers), conversations.ts, messages.ts, groups.ts (group rules), limits.ts, system-text.ts (client-safe)
src/lib/colors.ts     stable per-id colors (avatar tints, group sender names)
src/lib/types/chat.ts shared chat types (ChatMessage, ConversationListItem, ...)
public/emojibase/     self-hosted emoji data for the picker (no CDN)
src/server/           custom server: index.ts (entry), env.ts (loads .env first), io.ts (getIO/setIO/tryGetIO)
src/server/socket/    index.ts (handlers), auth.ts (handshake), presence.ts
src/server/media-cleanup.ts  hourly cleanup of unused uploads
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
- **Validation:** zod schemas in `src/lib/validations/` with English messages. They're shared by the client (instant feedback) and the Server Actions (the source of truth).
- **Forms:**
  - Server Actions return `FormState` (`src/lib/form.ts`). Field errors, the message and echoed non-secret values go back to the form.
  - Client forms use `useActionState` and `useFormFeedback(schema, state)`, which handles client validation and toasts the `message`.
  - Use `FormField` and `fieldA11y` for labels, errors and aria attributes.
- **Rate limiting:**
  - `src/lib/rate-limit.ts` keeps an in-memory fixed window on `globalThis`, which is valid because there's a single long-running process.
  - Logins allow 5 failures per IP+identifier per 15 minutes. Registrations allow 5 per IP per hour.
  - The client IP comes from `X-Forwarded-For`, which the reverse proxy must set. The custom server fills it from the socket address when it's missing.
- **LTR fields:** email, username and password inputs keep `dir="ltr"` + `text-start`, so they stay LTR if the UI direction ever changes.
- **Inputs are always 16px** (`text-base`, also on desktop) so iOS Safari doesn't zoom on focus. `md:text-sm` was removed from `ui/input.tsx` and `ui/textarea.tsx` on purpose.

## Layout conventions

- **Breakpoints:** phones are full screen. Tablets (`md`) get a centered card. **Desktop (`lg`, ≥1024px) gets two columns:**
  - `src/app/(app)/layout.tsx` renders a fixed 360px `DesktopSidebar` on the inline start: icon tabs plus the live chat list from the realtime store, with the selected chat highlighted.
  - The sidebar lives in that layout, so it stays mounted (no reload, no scroll reset) while the main pane changes. Its `usePathname()` sits inside `<Suspense>` (Cache Components).
  - The main pane is the `(tabs)` / `chats` `AppShell`. On `lg` the bottom nav is hidden (`lg:hidden`) and `/` shows `SelectChatPane` instead of the list. Floating buttons use `lg:bottom-6`.
- **Escape** in a chat closes, in order, the reply bar, then any open picker/sheet/dialog (Radix), then the chat.
- `AppShell` is the app frame with a scrollable `main`. Pass `nav` to show the bottom navigation.
- Each page renders its own sticky `PageHeader` (title, subtitle, `start`/`end` slots).
- Use `UserAvatar` for avatars, which shows initials with a deterministic tint. Use `BottomSheetContent` for bottom sheets.
- Display a username as `<bdi dir="ltr">@{username}</bdi>` so it's isolated from surrounding (possibly RTL) names. Only inputs get `dir="ltr"` + `text-start`.
- **Numbers:** use `formatNumber()` (`src/lib/numbers.ts`) for every number shown (counts, badges, percentages), `formatCount(n, "member")` for pluralized counts ("1 member" / "3 members"), and `formatBytes()` for file sizes. Don't call `toLocaleString()` directly.
- **Shared components:** empty states use `EmptyState` (icon, title, description, optional action). Loading states come from `src/components/skeletons.tsx`, used both by page `<Suspense>` fallbacks and by `loading.tsx`. `error.tsx` (root and `(app)`) uses `ErrorView` with "Try again", and `not-found.tsx` uses `NotFoundView`.
- **Accessibility:** icon-only buttons need an `aria-label`. Custom interactive elements get the global `:focus-visible` outline (`globals.css`). Chrome (`header`, `nav`, buttons) is `user-select: none`; message text stays selectable. All animation respects `prefers-reduced-motion`, and JS scrolling uses `scrollBehavior()`.
- **Performance:**
  - Lazy-load heavy client pieces with `next/dynamic`: the emoji picker panel, lightbox, video player and voice recorder are already split.
  - Keep zod out of always-loaded client components; import limits from zod-free modules (`lib/chat/limits.ts`, `lib/media/limits.ts`).
  - `MessageBubble` and `ConversationRow` are memoized, and rows subscribe to their own typing state.
  - The chat list page keeps its header, install banner and "New chat" in the static shell; only the list streams (Lighthouse LCP).

## PWA

- **Manifest:** `src/app/manifest.ts` (name "Kosholo", `lang: en`, `dir: ltr`, standalone, portrait, `theme_color`/`background_color` #ffffff, maskable icon). The root layout metadata adds the Apple web-app tags (`black-translucent` status bar), icons and light/dark `theme-color`.
- **Icons:** generated from `public/logo.svg` by `npm run icons` (sharp): `public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon,favicon-32}.png` and `src/app/favicon.ico`.
- **Service worker (Serwist):**
  - The source is `src/sw/sw.ts`. `npm run build:sw` (part of `npm run build`) bundles it with esbuild and injects the precache manifest with `@serwist/build` into `public/sw.js` (gitignored).
  - **Why not `@serwist/next` / `@serwist/turbopack`:** the first is a webpack plugin, and the second doesn't support `cacheComponents`. This framework-agnostic setup keeps Turbopack builds and works with the custom server, since `sw.js` is just a static file.
  - It's registered in **production only**, after `load` (`ServiceWorkerRegistration`). In dev, leftover workers are unregistered.
  - Updates wait; a toast "A new version is available" → "Update" posts `SKIP_WAITING`, then the page reloads on `controllerchange`.
- **Caching rules** (first match wins; only GET is routed):

  | Request | Strategy |
  |---|---|
  | `/socket.io`, `/api/upload`, full-size `/api/media/{id}` (video/voice ranges) | **network only, never cached** |
  | `/api/media/{id}/thumb` (image/video thumbs, avatars) | cache-first, 300 entries, 30 days |
  | `/_next/static/*`, `/icons/*`, `/emojibase/*`, fonts, svg, ico | cache-first |
  | page navigations | network-first (3s timeout) → cached page → `/~offline` |
  | Server Action POSTs, any non-GET | not routed (always network) |

  - The precache is deliberately small (CSS, `/~offline`, logo, icons, manifest). JS chunks are runtime-cached as they're used.
- **Offline page:** `/~offline` is a **route handler returning plain HTML** (inline CSS and a tiny script, no React). It renders from the precache alone and reloads when back online. It's public in `proxy.ts` and uses the system font.
- **Logout:** `clearAppCaches()` deletes every cache except Serwist's precache, which holds no user data and is needed for the offline page.
- **Install:**
  - `lib/pwa/install.ts` captures `beforeinstallprompt`, detects iOS and standalone mode, and remembers a dismissal for 14 days.
  - `InstallBanner` shows at the top of the chat list (and in the sidebar) after the user's first interaction in the session (no layout shift on load). On iOS it opens step-by-step instructions.
  - `InstallSettingsRow` is the permanent "Install app" row in settings. Nothing install-related shows in standalone mode.
- **Unread total** (`selectTotalUnread`): a badge on the "Chats" tab and sidebar tab, "(n) …" in `document.title` while the tab is hidden, and `navigator.setAppBadge` / `clearAppBadge` where supported (`RealtimeProvider`). The provider loads the chat list on start so this works on every page.
- **Notification sound:** a Web Audio two-note chime (`lib/pwa/notification-sound.ts`), unlocked by the first tap or key. It plays for others' non-system messages in conversations that aren't open and visible, and only if the per-device setting is on.
- **Settings** (profile page `SettingsSection`, per device): theme "System / Light / Dark" (next-themes), the notification-sound switch, "Install app", and "About" with the package.json version. They're stored in localStorage through try/catch helpers (`lib/pwa/settings.ts`).
- **Standalone feel:** no overscroll bounce on `html`/`body` (only page and message lists scroll), safe-area insets on header, bottom nav, composer and floating buttons, and `viewport-fit=cover` + `interactive-widget=resizes-content`.

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
  - Dates use `en-US` and the **viewer's time zone**: client components get it from `useTimeZone()` and pass it to every formatter (`formatTime(value, timeZone)`, `dayNumber(value, timeZone)`, ...).
  - `useTimeZone()` is a `useSyncExternalStore` that returns `UTC` for the server render and hydration (so they match), then the browser zone. Keep `suppressHydrationWarning` on rendered times.
  - Day/yesterday logic uses `dayNumber()`.
- **Keyboard:** the viewport has `interactive-widget=resizes-content` (Android). `useVisualViewportHeight()` sets `--app-height` from `visualViewport` for iOS, and `AppShell` uses it. In the chat, the message list is the only scroll area.
- **Emoji picker:** the frimousse-based shadcn `ui/emoji-picker.tsx`. Data is self-hosted in `public/emojibase/en`, with English category names in `messages.json`. Don't point it at a CDN (jsDelivr is blocked in some regions).
- **Reply deletion:** `Message.replyTo` is `onDelete: SetNull`, so a deleted original currently drops the link. `"deleted"` is rendered as "Message unavailable" for when message deletion lands.

## Groups

Groups are `Conversation`s with `type: GROUP`. They use the same chat UI, message, reply, emoji and realtime code as DIRECT chats; branch on `conversation.type` instead of duplicating components.

- **Rules:**
  - The title is 1–50 chars, trimmed. A group has at most 50 members.
  - Only the actor's **contacts** can be added (at creation, or later by an admin). Creating a group needs at least 1 other member.
  - The creator is `ADMIN`, and a group can have several admins.
  - Admins can rename, add members, remove **non-admin** members, promote, demote another admin, and delete the group for everyone.
  - Any member can leave. If the last admin leaves, the longest-standing member (`joinedAt`, then `userId`) becomes admin. If the last member leaves, the conversation is deleted.
- **Where:**
  - `src/lib/chat/groups.ts` (server-only) holds the rules. Every check runs **inside** the interactive transaction that makes the change, and violations throw `GroupError` with a user-facing message.
  - `src/app/(app)/chats/group-actions.ts`: `createGroup`, `renameGroup`, `addMembers`, `removeMember`, `leaveGroup`, `setMemberRole` and `deleteGroup`. Each one runs `requireUser`, zod validation (`lib/validations/groups.ts`), the transaction, then realtime events, and returns `{ ok, error? }`.
  - `run()` rethrows Next control flow (`unstable_rethrow`). **UI hiding is cosmetic; the server is the authority.**
- **Info data:** `getGroupInfo(conversationId, userId)` returns the title, avatar, createdAt, members (`ChatMember` = public user + role + joinedAt) and my role. `getMembers()` builds `conversation:updated` payloads.
- **Pages:**
  - `/chats/new-group` is a two-step flow: `MemberPicker` (checkboxes, filter, chips), then the title.
  - `/chats/[id]/info` shows `GroupInfoView` (live via `conversation:updated` / `removed`) or, for DIRECT, `DirectInfoView`. It opens from the chat header.
- **In chat:**
  - Others' bubbles show the sender name (`nameColor(id)`) on the first bubble of a run and a small avatar on the last.
  - Read receipts (✓✓) need **every** other current member who joined before the message to have read it.
  - Typing shows "{name} is typing" or "{n} people are typing".
  - The header shows "{n} members, {m} online"; the group chat subscribes to presence for all members.
  - The list prefixes previews with "Jane: " / "You: ".

### System messages

- `MessageType.SYSTEM` with `Message.meta` (JSON, type `SystemMeta` in `lib/types/chat.ts`): `{ event, actorId, actorName, targetIds?, targetNames?, newTitle?, auto? }`.
  - `event` is one of `created`, `member_added`, `member_removed`, `member_left`, `renamed`, `admin_promoted`, `admin_demoted` or `photo_changed` (with `removed: true` when the photo was removed).
  - `auto: true` marks the promotion that happens when the last admin leaves.
  - `senderId` is the actor.
- **Names live in meta** so the text still renders after people leave. `systemMessageText(meta, meId, currentNames?)` (`lib/chat/system-text.ts`) builds the English sentence on the client: "You"/"you" for the viewer, and current member names when known.
- **Rendering:** a centered muted pill (`SystemMessage`).
  - They break sender runs, can't be replied to (the server rejects `replyToId` pointing at one) and never count as unread (excluded in the unread SQL and in the client store).
  - They do show as the chat-list preview.
- **Creation:** `recordEvent()` in `groups.ts` creates them and bumps `conversation.updatedAt` in the same transaction.

## Media (images, videos, voice, avatars)

**Requirement: system `ffmpeg` and `ffprobe`.** They're used for video and voice, through `child_process`. Paths come from `FFMPEG_PATH` / `FFPROBE_PATH` (default `ffmpeg` / `ffprobe`). The custom server checks them at startup and logs a clear error if they're missing. Never use `ffmpeg-static` or other download-at-install packages. The Docker image needs `apt install ffmpeg` and a persistent volume for `UPLOAD_DIR`.

**Limits** (`src/lib/media/limits.ts`, shared by client and server):

| Kind | Max size | Real types (magic bytes via `file-type`) |
|---|---|---|
| Image | 10MB | JPEG/PNG/WebP/GIF |
| Video | 50MB | MP4/MOV/WebM |
| Voice | 10MB, max 5 min | MediaRecorder output (webm/opus, mp4/aac) and common audio |
| Avatar | 5MB | image |

- Up to 10 files per selection, each its own message (no albums).
- Uploads are rate limited to 60 per user per 10 minutes. Every rejection has a user-facing message (`MEDIA_ERRORS`).

**Data:**
- `Upload` stores `{ path, thumbPath, mime, size, width, height, duration, placeholder, waveform }`.
  - `path` is relative to `UPLOAD_DIR`: `yyyy/mm/{uuid}.{ext}`, plus `{uuid}.thumb.webp`.
- `Message.uploadId` (unique) links a message to its file.
- `ChatMessage.media` is a `ChatMedia`: `{ id, kind, url, thumbUrl, mime, width, height, duration, placeholder, waveform }`. URLs are always `/api/media/{id}` and `/api/media/{id}/thumb`; never select or send `path`.
- `User.avatarUrl` and `Conversation.avatarUrl` store `/api/media/{uploadId}`, and `avatarThumbUrl()` maps it to the 128px thumb.

**Pipeline:**
1. **Client:** `prepareFile` downscales photos to 2048px JPEG 0.85 (GIFs are kept), then `uploadFile` posts with XHR (progress, abort) to `POST /api/upload?kind=…`. The kind is in the query, so oversized bodies are rejected from `Content-Length` before they're read.
2. **Server:** the Route Handler (`src/app/api/upload/route.ts`) authenticates with the session cookie, then streams the body to `UPLOAD_DIR/tmp` and detects the real type.
   - **Image (sharp):** EXIF-rotated, metadata stripped, ≤2048px WebP q80. GIFs stay as-is. Each gets a 480px WebP thumb and a 16px placeholder.
   - **Video (ffprobe/ffmpeg):** H.264/AAC MP4 is remuxed with `+faststart`. Anything else (HEVC .mov, WebM) is transcoded to H.264/AAC (`veryfast`, `crf 26`, ≤1280px). A poster frame from ~1s becomes the thumb and placeholder. Rotation is applied to width/height.
   - **Voice:** converted to M4A (AAC mono 64kbps), so Chrome and Safari recordings play everywhere. The duration comes from ffprobe, and the client's peaks are validated and resampled to 48 bars.
   - **Avatar:** 512×512 center-cropped WebP plus a 128×128 thumb.
   - ffmpeg runs at most 2 jobs at a time.
3. **Send:** `sendMessage({ conversationId, uploadId, content?, replyToId?, tempId })`.
   - The upload must be the sender's, unused and not an avatar. The message type comes from the upload kind.
   - The content becomes an optional caption (≤1000 chars).
4. **Client flow:** `useMediaSender` shows optimistic bubbles from local object URLs, with a progress ring, cancel during upload/processing, and retry on failure (re-uploading only if needed).
   - Uploads run in parallel, but messages are sent in **selection order**.
   - Media messages use the same `tempId` / dedupe / realtime path as text.

**Serving and access** (`/api/media/[uploadId]`, `/thumb`; excluded from `proxy.ts` because Next limits bodies passing through the proxy, so these handlers authenticate themselves):
- `AVATAR`: any signed-in user.
- Other kinds: the uploader (for their pending optimistic message), or a member of the conversation whose message uses the upload.
- Everything else, unknown ids included, gets 404; no session gets 401.
- Files stream from disk with HTTP Range (206/416), HEAD, `ETag` (304) and `Cache-Control: private, max-age=31536000, immutable`. They're never served statically.

**Cleanup:** `src/server/media-cleanup.ts` runs hourly in the custom server. It deletes uploads (rows and files) older than 24h that no message uses and that aren't a user or group avatar. This covers abandoned sends, replaced avatars and files of deleted messages or groups. It also clears stale temp files.

**UI:**
- **Images:** a fixed aspect-ratio frame with the blur placeholder, then the thumb (the original for GIFs). The caption goes underneath, or the time overlays the image when there's no caption. Tapping opens `yet-another-react-lightbox` (zoom, download, pull down to close).
- **Video:** a poster with a play icon and an `m:ss` duration badge. Tapping opens a full-screen native player (`playsInline`, `autoplay`).
- **Voice:** the mic replaces send when the composer is empty.
  - Recording (`useVoiceRecorder`): hold to record, slide toward the inline start to cancel, slide up to lock. A tap shows a hint. Recordings under 1s are discarded, and recording stops automatically at 5 minutes.
  - Playback: the waveform doubles as the seek bar, there's a 1x / 1.5x / 2x toggle, and `audioManager` makes sure only one voice plays at a time.
- **Previews:** "📷 Photo", "🎬 Video", "🎤 Voice message (m:ss)", with the caption when there is one. Quotes and the reply bar show a thumbnail.
- **Media direction:** playback controls and timelines stay LTR (play icon, waveform direction).

**Avatars:**
- `AvatarEditor` (profile page; group info for admins) uploads `AVATAR`, then calls `setProfilePhoto` / `setGroupPhoto`.
- `setGroupPhoto` is admin-only, records `photo_changed` and emits `conversation:updated { avatarUrl }`.
- `setProfilePhoto` emits `user:updated` to everyone who shares a conversation with the user or has them as a contact.
- `UserAvatar` (client) reads live overrides from `store.avatars` (keyed by user id or group id), uses the 128px thumb for small sizes, and falls back to initials while loading or on error.

## Realtime (Socket.IO)

One process: Socket.IO is attached to the custom server.
- **Shared instances:** the io instance, the Prisma client, the membership cache and the rate limiter are all shared through `globalThis`. Next bundles and the custom server load separate copies of the same modules.
- **No `server-only` in socket code:** `src/server/socket/*` and everything it imports (`db.ts`, `session-token.ts`, `lib/realtime/*`) must not import `"server-only"` or `next/headers`. The custom server runs in plain Node, where `server-only` throws.
- **Server bundle format:** the server bundle is ESM (`dist/server.mjs`), because the generated Prisma client uses `import.meta.url`.
- **Env loading:** `.env` is loaded by `src/server/env.ts` (`process.loadEnvFile`), which must stay the first import of `src/server/index.ts`. It also validates required env (`DATABASE_URL`, `JWT_SECRET` ≥ 32 chars, `UPLOAD_DIR`) and exits with a clear error otherwise.

**Event contract:** `src/lib/realtime/events.ts` defines every event name, payload type and room helper, typed through Socket.IO's generics on both sides. Add new events there.

| Direction | Event | Payload | Delivered to |
|---|---|---|---|
| S→C | `session:ready` | `{ userId }` | the socket, after auth |
| S→C | `message:new` | `{ message: ChatMessage, tempId }` | `user:{id}` of **every** member (incl. sender's other tabs) |
| S→C | `conversation:read` | `{ conversationId, userId, lastReadAt }` | `user:{id}` of every member |
| S→C | `typing:start` / `typing:stop` | `{ conversationId, userId, name }` | `user:{id}` of the other members |
| S→C | `presence:update` | `{ userId, online, lastSeenAt }` | `presence:{userId}` |
| S→C | `conversation:updated` | `{ conversationId, title?, avatarUrl?, members? }` | `user:{id}` of every member, after rename / photo / membership / role changes |
| S→C | `user:updated` | `{ userId, name?, avatarUrl? }` | `user:{id}` of everyone sharing a conversation with the user or having them as a contact |
| S→C | `conversation:removed` | `{ conversationId, reason: "removed" \| "left" \| "deleted" }` | `user:{id}` of the former member(s) |
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
- **Membership changes:**
  - Call `invalidateMembership(id)` **before** emitting to the new member list (adds).
  - Use `emitRemoved(id, userIds, reason)` for people who are no longer members. It emits `conversation:removed`, runs `io.in(user rooms).socketsLeave(conv room)` and invalidates the cache.
- **Group system messages** go out as normal `message:new` (`tempId: null`). A new member's client sees an unknown conversation and fetches its row, so the group appears in their list instantly.
- **Client side:** `conversation:removed` removes the row from the list. An open chat shows a non-dismissable banner ("You're no longer a member of this group" / "This group was deleted") and hides the composer.
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
- **Header subtitle priority:** "Connecting…" (disconnected) → "typing" → "online" / "last seen …".
- **Socket transports:** websocket first with a polling fallback, and default auto-reconnect.

## Production deployment

Full step-by-step guide (for the server admin): `DEPLOY.md`.

- **Files:**
  - `Dockerfile`: multi-stage build (deps → build → runner) on Debian slim Node. Build args are `NODE_IMAGE`, `NPM_REGISTRY` and `APT_MIRROR`, so builds can go through mirrors where Docker Hub, npm or Debian are blocked or slow.
  - The runner stage installs `ffmpeg`, runs as the non-root `node` user, and has a HEALTHCHECK on `/api/health`.
  - `docker-entrypoint.sh` runs `prisma migrate deploy`, then `exec node dist/server.mjs`.
  - `.dockerignore`.
- **`docker-compose.prod.yml`** defines three services:
  - `db`: postgres 17.6, volume `pgdata`, not published.
  - `app`: image `kosholo-app:latest`, volume `uploads` → `/app/uploads`, internal only.
  - `caddy`: ports 80/443 (+443/udp), volumes `caddy_data`/`caddy_config`, `./Caddyfile`.
  - All three use log rotation (json-file, 10m × 3).
  - Always run it as `docker compose --env-file .env.production -f docker-compose.prod.yml …`. The `--env-file` is needed for image/mirror/port interpolation; containers get their env from `env_file: .env.production`.
  - It has its own project name, **`name: kosholo-prod`**, so its volumes are `kosholo-prod_*`. Never remove that name. Without it, the prod stack shares the dev stack's project (`kosholo`) and mounts the dev `kosholo_pgdata` volume. The two postgres images (debian uid 999 vs alpine uid 70) then fight over the same data directory.
  - `./Caddyfile` is a single-file bind mount. After it's replaced (an edit or `git pull`), the container keeps the old inode until `restart caddy`; `deploy.sh` does this automatically when the file changed.
- **`Caddyfile`:**
  - Automatic HTTPS for `{$DOMAIN}`.
  - Proxies to `app:3000`, with WebSockets and 10-minute timeouts.
  - 60MB body limit.
  - zstd/gzip, except `/api/media/*`.
  - Security headers; Permissions-Policy allows camera and microphone for self.
  - HTML responses get `Cache-Control: no-cache`, because Next marks prerendered pages `s-maxage=1y` and a CDN would serve stale chunk references after a deploy. No proxy caching otherwise.
- **`scripts/`:**
  - `backup.sh`: pg_dump plus an uploads tar into `backups/YYYY-MM-DD_HHMM/`; keeps 7.
  - `restore.sh <folder>`.
  - `deploy.sh`: pull, build, up, prune, wait for healthy.
  - `wait-healthy.sh`.
- **App readiness rules:**
  - The server listens on `HOST` (default `0.0.0.0`) and `PORT`. Don't use `HOSTNAME`, which Docker sets to the container id.
  - SIGTERM/SIGINT shut down gracefully (10s cap).
  - `GET /api/health` runs `SELECT 1` and returns 200 or 503. It's excluded from the proxy; keep it that way.
  - Socket.IO accepts same-origin connections only.
  - The client IP is the right-most `X-Forwarded-For` entry (the one Caddy appends).
  - ffmpeg runs at most 2 jobs at a time, each with a `FFMPEG_TIMEOUT_SECONDS` limit.
- **Logging:** server code logs through `src/lib/logger.ts` (`logger.info/warn/error(scope, msg, err?)`, timestamped and levelled). Never log secrets, tokens, passwords or message contents.
- **Rule: every new env var** must be added to `.env.example`, `.env.production.example` (commented) **and** the table in `DEPLOY.md` §5. If the container needs a fixed value, set it in `docker-compose.prod.yml`.
- **Lockfile:** the image uses npm 11 (`npm ci`), which is stricter than local npm 10 about optional platform packages. If `npm ci` fails in the image, regenerate `package-lock.json` with npm 11, e.g. a full `npm install` inside `node:24.11-trixie-slim`, and check it with `npm ci --dry-run` both there and locally.

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
npm run typecheck           # app + service worker (src/sw has its own tsconfig)
npm run icons               # regenerate PWA icons/favicons from public/logo.svg
npm run build               # prisma generate + next build + esbuild server -> dist/server.mjs + service worker -> public/sw.js
npm start                   # NODE_ENV=production node dist/server.mjs
```

In dev, `tsx watch` restarts the whole server when a file the custom server imports changes (`src/server/**`, `src/lib/db.ts`, `src/lib/realtime/**`, `src/lib/session-token.ts`). UI changes go through Next HMR. Only one `next dev` can run per project directory (Next holds a lock), so stop an old `npm run dev` before starting another.

In a non-interactive shell (e.g. an agent), `prisma migrate dev` refuses to run. Write the migration SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into `prisma/migrations/<timestamp>_<name>/migration.sql`, then apply it with `npx prisma migrate deploy` and `npx prisma generate`.
