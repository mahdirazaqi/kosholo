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
src/components/chat/  chat list, new-conversation/new-chat sheets, chat view, message list/bubble, system message, composer, emoji button,
                      delete-dialog, conversation-actions (clear/delete/leave menus + dialogs)
src/components/groups/ new-group flow, member picker, group info view, direct info view
src/components/chat/media/ image/video/voice/file bubbles, upload progress, viewer, attach + preview (media and files)
src/components/chat/location/ location bubble + thumb (static tiles), picker and viewer (Leaflet, lazy)
src/components/channels/ channel info view (admin tools), new-channel flow, join card; src/components/linkified-text.tsx (safe links)
src/app/(app)/chats/channel-actions.ts  all channel Server Actions; src/app/(app)/join/[token]/ invite-link page
src/components/avatar-editor.tsx  change/remove a profile, group or channel photo
src/app/api/upload/   POST: upload + process (Route Handler, auth inside); files/: the resumable FILE protocol
src/app/api/media/    GET/HEAD [uploadId] and [uploadId]/thumb: access-checked, Range-aware streaming
src/app/(app)/photo-actions.ts  setProfilePhoto, setGroupPhoto
src/components/auth/  login/register forms, auth card
src/components/profile/ profile forms + logout dialog
src/components/ui/    shadcn components (logical-direction audited)
src/generated/prisma/ generated Prisma client (do not edit)
src/hooks/            client hooks (use-conversation-realtime, use-media-sender, use-file-sender, use-presence, use-now, use-time-zone, use-form-feedback, use-media-query, use-visual-viewport-height)
src/lib/              db.ts, session.ts, session-token.ts, auth.ts, users.ts, contacts.ts, rate-limit.ts, form.ts, validations/, format-date.ts, numbers.ts, emoji.ts, client-utils.ts, utils.ts
src/lib/pwa/          settings.ts (per-device), install.ts, notification-sound.ts, caches.ts
src/lib/upload/       protocol.ts (shared contract), server.ts (sessions), filename.ts (sanitize + Content-Disposition), resumable.ts (client manager), file-kind.ts
src/lib/map/          config.ts (tile env), tiles.ts (tile math, distance); src/lib/map-links.ts (Google Maps, Neshan, Balad, geo:)
src/lib/realtime/     events.ts (typed event contract + rooms), membership.ts (cached), emit.ts (from Server Actions)
src/lib/realtime/client/ socket.ts (typed client), store.ts (zustand), merge.ts (dedupe rule)
src/lib/media/        limits.ts (shared), storage.ts, ffmpeg.ts, serialize.ts (no server-only: also used by the custom server);
                      process.ts (sharp/ffmpeg), access.ts, serve.ts, routes.ts (server-only); client/ (prepare, upload, audio-manager)
src/lib/chat/         forward.ts (the one copy implementation) + forward-emit.ts + forward-limits.ts, saved.ts (Saved Messages: get-or-create), pending-jump.ts, edit.ts + edit-config.ts (message editing), queries.ts (selects + mappers), conversations.ts, messages.ts, groups.ts (group rules), channels.ts (channel rules), channel-view.ts (subscriber copy of a post, client-safe), views.ts (post view counts), limits.ts, system-text.ts (client-safe),
                      visibility.ts (the visibility rule), delete.ts (deletion rules), purge.ts (hard delete + GC), permissions.ts (client-safe)
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
  | `/socket.io` | network only |
  | `/api/upload/*`, full-size `/api/media/{id}` (big files, video/voice ranges, resumable downloads) | **not intercepted at all** (no rule matches) |
  | map tiles (`NEXT_PUBLIC_MAP_TILE_URL` pattern, cross-origin, opaque allowed) | cache-first, 500 entries, 7 days; nothing else from the tile host |
  | `/api/media/{id}/thumb` (image/video thumbs, avatars) | cache-first, 300 entries, 30 days |
  | `/_next/static/*`, `/icons/*`, `/emojibase/*`, fonts, svg, ico | cache-first |
  | page navigations (never `/api/*`: a download is a navigation) | network-first (3s timeout) → cached page → `/~offline` |
  | Server Action POSTs, any non-GET | not routed (always network) |

  - The precache is deliberately small (CSS, `/~offline`, logo, icons, manifest). JS chunks are runtime-cached as they're used.
- **Offline page:** `/~offline` is a **route handler returning plain HTML** (inline CSS and a tiny script, no React). It renders from the precache alone and reloads when back online. It's public in `proxy.ts` and uses the system font.
- **Logout:** `clearAppCaches()` deletes every cache except Serwist's precache, which holds no user data and is needed for the offline page.
- **Install:**
  - `lib/pwa/install.ts` captures `beforeinstallprompt`, detects iOS and standalone mode, and remembers a dismissal for 14 days.
  - `InstallBanner` shows at the top of the chat list (and in the sidebar) after the user's first interaction in the session (no layout shift on load). On iOS it opens step-by-step instructions.
  - `InstallSettingsRow` is the permanent "Install app" row in settings. Nothing install-related shows in standalone mode.
- **Unread** (`src/lib/chat/unread.ts`, the one place that counts; the one client store entry that every badge reads):
  - **Rule:** a message counts for user U when it is visible to U (the visibility rule), created after U's `lastReadAt`, not sent by U, and not a system message. Muted conversations keep their own count but are excluded from `total`. A conversation U left, was removed from, or that was deleted has no membership row and counts 0.
  - **Server:** `getUnreadSummary(userId, onlyId?)` → `{ total, perConversation: { [id]: { count, muted } } }` in one aggregated `GROUP BY` query. `getConversations` no longer counts anything. Actions: `getUnread`, `markAsRead`, `markAllAsRead` (one `updateMany` over non-muted memberships, then `conversation:read` per conversation that had unread).
  - **Client, single store:** `useRealtimeStore.unread` (`{ [id]: { count, muted } }`) with `selectTotalUnread`, `selectUnreadCount(id)` and `selectOtherUnread(exceptId)`. **No component computes unread on its own and `ConversationListItem` has no count**: badges render `UnreadPill` (`components/unread-pill.tsx`: capped at 99+, hidden at 0, gray when muted, scale-in only with `motion-safe`) from these selectors.
  - **Kept correct** (`RealtimeProvider`, `useConversationRealtime`): `message:new` from someone else → +1 (`countIncomingUnread`, idempotent per message id) unless that chat is open and the tab visible (then it is marked read); `markAsRead` in this tab and `conversation:read` for my own id from other tabs/devices → 0 (`emitRead` already sends it to my rooms); `message:deleted` / `conversation:cleared` → `refreshUnread(id)`; `conversation:deleted` / `removed` → entry dropped; mute → `patchConversation` flips the entry's `muted`, so the total recomputes; app start, socket (re)connect and the tab becoming visible → `getUnread()` replaces the whole store (**server wins**).
  - **Where it shows:** chat-list rows (pill at the inline end, bold name and preview when unread), the "Chats" bottom-nav tab and sidebar tab (total), the chat page's back button (total of the *other* conversations, mobile only), the tab title `(n) Kosholo` (whatever the tab visibility; a `MutationObserver` restores the prefix after navigations), the favicon and the installed app icon.
  - **Favicon** (`lib/pwa/badges.ts`): desktop only (not `pointer: coarse`); the 32px icon is drawn on a canvas with a red circle and the count (Western digits, `99+`), every `link[rel~=icon]` is pointed at it and restored at 0. **App icon:** `navigator.setAppBadge` / `clearAppBadge`, feature-detected and try/catch'd. Both are throttled to once per second and cleared on logout and provider unmount (`clearBadges`).
  - **Platforms:** desktop Chrome/Edge (installed) need nothing. iOS/iPadOS 16.4+ (Home Screen app only) show the badge only with notification permission: the profile setting "Show unread count on the app icon" (`AppBadgeSetting`) requests it from the user's tap, never automatically, shows enabled / not allowed (with the iOS Settings path) and exists only for the iOS standalone case. Android Chrome has no `setAppBadge`: a silent no-op, no setting.
  - **Limit:** without push notifications the icon badge only updates while the app is open or recently backgrounded, and keeps its last value once the app is closed.
  - **Extras:** the row menu has "Mark as read" when unread > 0 (no need to open the chat); the chat-list header menu has "Read all" (confirm only above 50 unread); opening a chat with unread messages scrolls to the "Unread messages" divider (`ChatConversation.lastReadAt` decides, the divider stays until you leave) instead of the bottom.
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
  - `ChatMessage` has `id, conversationId, type, content, media, location` (`{ latitude, longitude, label } | null`), `meta, createdAt` (ISO string), `sender` (a `PublicUser`), `replyTo` (`ReplyPreview | null | "deleted"`), and client-only `status` (`sending | sent | failed`) plus `tempId`.
  - `ConversationListItem` has `id, type, title, avatarUrl, otherUser, lastMessage {type, content, isMine}, lastMessageAt, muted` (no unread count: see Unread under PWA).
  - `ChatConversation` is the chat screen header data. `MessagesPage` is `{ messages (oldest → newest), nextCursor }`.
- **Queries** (server-only, `src/lib/chat/`):
  - Always select with `messageSelect` / `conversationSelect` and map with `toChatMessage()` (`queries.ts`), so every query returns the same shape and never private user fields.
  - `getConversations(userId)` returns only conversations with at least one message **visible to the user**, sorted by the newest visible message. The last message comes from one raw SQL query that applies the visibility rule. Each row has the viewer's `myRole`.
  - `getMessages(conversationId, viewer, cursor?)` pages 40 visible messages at a time, newest first from the DB, returned oldest → newest. The `viewer` comes from `getViewer()`, which is also the membership check. `cursor` is the oldest loaded message's position (`"createdAt|id"`), not a row reference, so paging survives that message being deleted.
- **Actions** (`src/app/(app)/chats/actions.ts`):
  - `sendMessage({ conversationId, content, replyToId? })`: zod-validated (trim, 1–4000 chars), checks membership, requires `replyToId` to be in the same conversation, and is rate limited to 60/min per user. In one transaction it creates the message, bumps `conversation.updatedAt` and sets the sender's `lastReadAt`. Returns `{ ok, message }`.
  - `markAsRead(conversationId)` and `loadOlderMessages(conversationId, cursor)`.
  - `getMessagesSince(conversationId, since, knownIds)` also returns `goneIds`: which of the shown messages were deleted while the client was offline.
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
- **Reply deletion:** `Message.replyTo` is `onDelete: SetNull`. When an original is hard-deleted, `purgeMessages()` first sets `replyToDeleted` on its replies, so the quote still renders as "Message unavailable" (`replyTo: "deleted"`). A quote of a message the viewer can't see (hidden or cleared) is also `"deleted"` for that viewer only: `toChatMessage(row, viewer)`, and `sendMessage` sends per-recipient `message:new` payloads when the quote is hidden for some members.

## Groups

Groups are `Conversation`s with `type: GROUP`. They use the same chat UI, message, reply, emoji and realtime code as DIRECT chats; branch on `conversation.type` instead of duplicating components.

- **Rules:**
  - The title is 1–50 chars, trimmed. A group has at most 50 members.
  - Only the actor's **contacts** can be added (at creation, or later by an admin). Creating a group needs at least 1 other member.
  - The creator is `ADMIN`, and a group can have several admins.
  - Admins can rename, add members, remove **non-admin** members, promote, demote another admin, and delete the group for everyone.
  - Any member can leave ("Leave and delete group" in the UI, which also drops their "deleted for me" records). If the last admin leaves, the longest-standing member (`joinedAt`, then `userId`) becomes admin. If the last member leaves, the conversation is deleted.
- **Where:**
  - `src/lib/chat/groups.ts` (server-only) holds the rules. Every check runs **inside** the interactive transaction that makes the change, and violations throw `GroupError` with a user-facing message.
  - `src/app/(app)/chats/group-actions.ts`: `createGroup`, `renameGroup`, `addMembers`, `removeMember`, `leaveGroup`, `leaveAndDeleteGroup`, `setMemberRole` and `deleteGroup`. Each one runs `requireUser`, zod validation (`lib/validations/groups.ts`), the transaction, then realtime events, and returns `{ ok, error? }`.
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
  - `event` is one of `created`, `member_added`, `member_removed`, `member_left`, `renamed`, `admin_promoted`, `admin_demoted`, `photo_changed` (with `removed: true` when the photo was removed) or `history_cleared` (an admin cleared the history for everyone).
  - `auto: true` marks the promotion that happens when the last admin leaves.
  - `senderId` is the actor.
- **Names live in meta** so the text still renders after people leave. `systemMessageText(meta, meId, currentNames?)` (`lib/chat/system-text.ts`) builds the English sentence on the client: "You"/"you" for the viewer, and current member names when known.
- **Rendering:** a centered muted pill (`SystemMessage`).
  - They break sender runs, can't be replied to (the server rejects `replyToId` pointing at one) and never count as unread (excluded in the unread SQL and in the client store).
  - They do show as the chat-list preview.
- **Creation:** `recordEvent()` in `groups.ts` creates them and bumps `conversation.updatedAt` in the same transaction.

## Forwarding

Telegram-style forwarding, built on the Saved Messages snapshot. **There is exactly one copy implementation: `forwardMessages` in `src/lib/chat/forward.ts`** (saving is a forward to my SAVED conversation). `chats/forward-actions.ts` is the Server Action (zod, `LIMITS.forwards` = 30 per 10 min), `forward-emit.ts` (`runForward`) forwards and then emits `message:new` per created message through `emitMessageNew` (per-role payloads in channels; unread, list order and sounds work as for any new message).
- **Source:** messages visible to me in one conversation (membership + visibility for every id), no SYSTEM messages; any type. Channel subscribers can forward channel posts. **Targets:** a `{ conversationId }` I can send to (DIRECT, GROUP member, CHANNEL admin only via `canPost`, SAVED) or `{ userId }` of a contact (the direct conversation is created through `getOrCreateDirectConversation`, shared with `startDirectConversation`). Max 100 messages and 10 targets (`lib/chat/forward-limits.ts`, zod-free); more is rejected.
- **One transaction per target**, so one failing target (e.g. a channel I'm not admin of) doesn't block the others: the result is `{ results: [{ targetConversationId, ok, error?, messages }] }`. Per target: the optional **comment** as a TEXT message first, then the copies in original order, with strictly increasing `createdAt` (+1 ms each). Then `conversation.updatedAt` and my `lastReadAt` move, like a send. Replies are not carried over.
- **Copies** are independent (later edits/deletes of the original don't touch them) and share the same `Upload` row (shared-upload rule; no file is written). **Snapshot** (`forwardFrom*`): the original sender's name; for a channel post the channel title (+ the signature when the channel signs), never an admin's identity; a forwarded copy keeps its ORIGINAL snapshot (no nesting).
- **Options:** `hideSender` creates the copies without any snapshot (they are my own messages, editable in the normal window); `hideCaptions` drops the captions of IMAGE/VIDEO/FILE copies and is only allowed together with `hideSender`.
- **Single target (default):** the picker (`ForwardPicker`: bottom sheet on phones, dialog on desktop; Saved Messages first, then recent chats I can send to, then contacts with no chat; search by name/@username) closes, opens that chat and puts a **pending forward** in its composer (`pendingForwards[conversationId]` in the realtime store: kept while navigating, lost on reload; exclusive with reply and edit). The bar above the composer shows the count/preview and "From: names" (or "Sender name is hidden"); tapping it offers show/hide sender, show/hide captions, "Change recipient" and "Cancel forward"; typed text becomes the comment and sending works with an empty field. Sending adds optimistic bubbles (comment first) that merge with the server's through `tempIds` (echoed in `message:new`) and can be retried per message.
- **Multiple targets:** long-press a row or use "Select multiple" (max 10): comment field, hide-sender / hide-captions switches and a Forward button; results are toasted per target ("Forwarded to {n} chats", failures with their reason, "Saved to Saved Messages" for Saved only).
- **Entry points:** "Forward" in the message menu (all chat types), the selection bar and the media viewer.

## Saved Messages

Telegram-style "Saved Messages": every user has exactly one private conversation with only themselves in it (`ConversationType.SAVED`, `directKey = "saved:{userId}"`, one `ConversationMember`). It reuses the normal chat UI, composer, message types, reply, edit, delete, select, uploads and realtime.
- **Create:** lazily, by `getOrCreateSavedConversation(userId)` (`lib/chat/saved.ts`): find by `directKey`, else create and, on the unique-constraint race (P2002, e.g. two tabs), read the winner. `/saved` (a page; links use `prefetch={false}` so a prefetch never creates it) creates it and redirects to `/chats/{id}`. Shortcuts: the profile page, the desktop sidebar header, and the first row of the new-chat picker. It shows in the chat list like any chat (only once it has a message).
- **Looks and behaviour:** title "Saved Messages" (`describe()` in `conversations.ts`), bookmark avatar on the primary color (`UserAvatar saved`), no subtitle/presence/typing/read receipts/ticks, never unread (my own messages never count), no member list and no info page (`ChatConversation.members`/`readStates` empty). The header menu only has "Clear history" and "Delete chat". Deleting messages is always a hard delete (no "for everyone" checkbox); clearing the history purges everything (nobody else can see it); deleting the chat hard-deletes it and it is recreated empty on the next open.
- **Saving (copy):** `saveMessages({ conversationId, messageIds })` (`chats/saved-actions.ts`) is just `forwardMessages` with my SAVED conversation as the only target (see Forwarding: there is one copy implementation). Saving from Saved Messages into itself is refused. Rate limited (`LIMITS.saves`). I'm the only member, so `message:new` reaches only my own rooms. Entry points: "Save" in the message menu (all chat types, channel subscribers too), the Save button in the selection bar, and the media viewer's Save button; none inside Saved Messages. The toast has a "View" action.
- **Forward snapshot** (`Message.forwardFromName`, `forwardFromConversationId`, `forwardFromMessageId`, `forwardOriginalDate`; exposed as `ChatMessage.forward`): independent of the original, which may later be edited or deleted (the two ids become null through `onDelete: SetNull`; the name and date stay). `forwardFromName` is the sender's name, or for a channel post the **channel title (plus the signature if `signMessages` is on)**, never an admin's identity for subscribers. An existing snapshot is kept, never nested.
- **Editing:** my own non-forwarded messages in Saved Messages can be edited with no time limit; forwarded copies can never be edited (`editBlock` → "forwarded", enforced by the server too).
- **Rendering:** "Forwarded from {name}" with a forward icon at the top of the bubble (primary color; on my own primary bubble the contrasting color). Tapping it calls `checkForwardOrigin` (the original exists and I can see it): then `setPendingJump` + navigation, and the target `MessageList` scrolls to and highlights it (same logic as quote jumps, `lib/chat/pending-jump.ts`); otherwise the toast "The original message isn't available". The time popover also shows "Original date". Quotes and the chat-list preview show the content normally.
- **Access:** `/api/media` serves an upload when the user can see at least one message that references it, so nobody else reaches my saved copies' media unless they can still see the original message.

## Editing messages

Telegram-style, **in place**: `Message.editedAt` (nullable) and the new `content`; no history is stored (like hard deletion). Server: `src/lib/chat/edit.ts` (`editMessage`, `getEditsSince`, `EditError`) and `chats/edit-actions.ts` (`editMessage`, `getEditsSince`); the rules live in `permissions.ts` (`editBlock`, client-safe, used by both sides).
- **What:** TEXT (the text, 1–4000 after trim) and the caption of IMAGE/VIDEO/FILE (0–1000, can be removed). Never VOICE, LOCATION, SYSTEM or the media itself. A TEXT message can't become empty: the client opens the delete dialog ("Message is empty. Delete it?") instead of saving.
- **Who:** DIRECT/GROUP: only the sender, only within `EDIT_WINDOW_HOURS` (runtime env, default 48; `ChatConversation.editWindowHours` hides "Edit" after it). CHANNEL: any admin, any post, no time limit; subscribers never. The server re-checks everything (`EDIT_ERRORS`: "You can only edit your own messages", "The time to edit this message has passed", …); the visibility rule decides whether the message still exists for the editor ("This message has been deleted" → the client drops it).
- **No-op:** identical content saves nothing, keeps `editedAt`, sends no event. An edit never changes `createdAt` (order), `conversation.updatedAt`, `lastReadAt`, unread counts, views or read receipts, and never plays a sound. One conditional `updateMany` (id + conversation + visibility) does the write; edits are rate limited (`LIMITS.edits`, 60 per 10 minutes).
- **Realtime:** `message:edited { conversationId, messageId, content, editedAt }` to the user rooms of the members who can still see the message (no `MessageHide`, not cleared past it), including the editor's other tabs. The payload carries no author, so channel subscribers learn nothing about which admin edited. Clients update the bubble, every quote of it (`applyEdit`, also the reply bar), the chat-list preview when it is the row's last message (`LastMessagePreview.id`, `applyEditToList`) and emoji-only rendering.
- **Offline sync:** the open chat catches up with `getEditsSince(conversationId, since, from)` (edits after the last sync, only messages created at or after the oldest loaded one) on reconnect and when the tab is visible again. `since` starts at `ChatConversation.loadedAt` and then follows the server time returned by each sync.
- **UI:** "Edit" (pencil) in the message menu (mobile sheet and desktop hover menu) only when allowed; ArrowUp in an empty desktop composer edits my newest editable message. Edit mode: a bar like the reply bar ("Edit message" / "Edit caption" with the thumbnail), the field filled with the text (caret at the end), the send button becomes a check mark, attach and mic are hidden, no typing indicator. Edit and reply are exclusive; Escape or X cancels and restores the previous draft; swipe-to-reply and "Select" are off while editing. Saving is optimistic (clock icon while saving, reverted with an error toast on failure).
- **Label:** "edited" + the edit time sits before the time in the footer (or the overlay for emoji-only and caption-less media, and next to the view count in channels: "👁 123 · edited 14:32"). Hover (mouse) or tap shows "Sent: …" and "Edited: …". Not shown in the chat list or in quotes.

## Deleting messages and conversations

**Hard delete only.** There is no soft delete anywhere: no `deletedAt` / `isDeleted` flags. Deleting removes rows from the database and files from disk, and every deletion is irreversible (dialogs say "This can't be undone.").

- **"For me"** can't remove a shared row, so it's stored as per-user visibility data:
  - `MessageHide { userId, messageId }`: the message is deleted for that user only.
  - `ConversationMember.clearedAt`: messages created at or before it are invisible to that member ("clear history for me", and "delete chat for me" in DIRECT).
- **Garbage collection** (`collectGarbage()` in `lib/chat/purge.ts`) runs in the same transaction after every "for me" change and after a member leaves or is removed: messages **no current member** can see are hard-deleted with their uploads. A DIRECT conversation with no messages left whose members have all cleared it is hard-deleted too.
- **Files:** `purgeMessages()` / `purgeConversation()` delete the `Upload` rows in the transaction and return their `path`/`thumbPath`; callers unlink them **after commit** with `unlinkPurgedFiles()` (missing files are ignored, other errors logged). Message uploads are never avatars.
- Nothing derived is stored: after a deletion the chat-list row (preview, time, unread) is recomputed from the visibility rule (`refreshConversationRow()` on the client re-fetches it, or drops it when nothing is visible).

**The visibility rule** (`src/lib/chat/visibility.ts`, apply it to every read): a message is visible to user U only if U is a **current member**, the message is **not in `MessageHide` for U**, and **U's `clearedAt` is null or older than `message.createdAt`**.
- `getViewer(conversationId, userId)` is the membership check and returns `{ userId, clearedAt, role, conversationType }`; `visibleMessageWhere(viewer)` is the Prisma filter (combine with `AND`); `visibleSql("m", "cm")` is the same rule for raw SQL; `isVisibleTo()` checks a loaded row.
- Used by `getMessages`, `getMessagesSince` (+ `goneIds`), `getConversations` (last message, unread, "has a visible message"), quotes, the `sendMessage` reply check, and `/api/media` access.
- A cleared conversation leaves the user's list and comes back with the next new message, showing only new messages.

**Permissions** (`src/lib/chat/permissions.ts`, client-safe; the server re-checks everything inside the transaction in `src/lib/chat/delete.ts`):

| Action | DIRECT | GROUP |
|---|---|---|
| Delete message for me | any visible message (incl. system) | any visible message (incl. system) |
| Delete message for everyone | either member, any non-system message | own non-system messages; admins: any message, incl. system |
| Clear history for me | either member | any member |
| Clear history for everyone | either member (conversation kept) | admins only; adds a `history_cleared` system message |
| Delete chat for me | either member (= clear for me) | — |
| Delete chat for everyone | either member (hard-deletes the conversation) | admin "Delete group for everyone" (`deleteGroup`) |
| Leave and delete group | — | any member: `leaveGroup` + removes my `MessageHide` rows for the group |

- **CHANNEL:** there is no "delete message for me" (subscribers can't delete individual posts at all). Admins delete any post/system message for everyone (the dialog has no checkbox, `alwaysEveryone`) and clear the history for everyone (adds `history_cleared`); every member clears for me or leaves. The owner deletes the channel (`conversation:deleted` to every member).
- At most 100 message ids per request (`MAX_DELETE_MESSAGES`); all must be visible to the actor and belong to the conversation, or the whole request is rejected.

**Server:** `src/lib/chat/delete.ts` (`deleteMessages`, `clearHistory`, `deleteDirectConversation`, throwing `DeleteError`) and `src/app/(app)/chats/delete-actions.ts` (`deleteMessages`, `clearHistory`, `deleteConversation`, each returning `{ ok, conversationDeleted } | { ok: false, error }`). Hard-deleted conversations go through `emitConversationDeleted()`, which also invalidates the membership cache.

**Client:**
- Message actions (long-press sheet / hover menu) have "Select" and "Delete". Selection mode turns the header into a bar ("{n} messages selected", X, delete); a tap toggles a message (check circle at the inline start); swipe-to-reply is off and the composer is `inert`; Escape exits and Delete opens the dialog on desktop.
- `DeleteDialog` (`components/chat/delete-dialog.tsx`): title, the irreversible warning and an "Also delete for {name}" / "Delete for everyone" checkbox, shown only when **every** selected message may be deleted for everyone.
- Deleting is optimistic: messages fade out at once (`removing`), reply bar, quotes, selection, a playing voice (`audioManager.release`) and an open viewer follow; on failure they're restored with an error toast.
- Conversation actions (`components/chat/conversation-actions.tsx`): the header ⋮ menu, chat-list rows (long-press sheet on touch, right-click / hover menu on desktop) and the bottom of both info pages. "Clear history", "Delete chat" (DIRECT) or "Leave and delete group" (GROUP), plus the admin's "Delete group for everyone" in the header and group info. `markLocalDelete()` keeps the acting tab from toasting its own deletion; other open chats navigate to `/` with "This chat was deleted".

## Media (images, videos, voice, avatars, files)

**Requirement: system `ffmpeg` and `ffprobe`.** They're used for video and voice, through `child_process`. Paths come from `FFMPEG_PATH` / `FFPROBE_PATH` (default `ffmpeg` / `ffprobe`). The custom server checks them at startup and logs a clear error if they're missing. Never use `ffmpeg-static` or other download-at-install packages. The Docker image needs `apt install ffmpeg` and a persistent volume for `UPLOAD_DIR`.

**Limits** (`src/lib/media/limits.ts`, shared by client and server):

| Kind | Max size | Real types (magic bytes via `file-type`) |
|---|---|---|
| Image | 10MB | JPEG/PNG/WebP/GIF |
| Video | 50MB | MP4/MOV/WebM |
| Voice | 10MB, max 5 min | MediaRecorder output (webm/opus, mp4/aac) and common audio |
| Avatar | 5MB | image |
| File | `MAX_FILE_SIZE_MB` (default 2048) | anything (see Files) |

- Up to 10 files per selection, each its own message (no albums).
- Uploads are rate limited to 60 per user per 10 minutes. Every rejection has a user-facing message (`MEDIA_ERRORS`).

**Data:**
- `Upload` stores `{ path, thumbPath, originalName (FILE), mime, size (BigInt), width, height, duration, placeholder, waveform }`.
  - `path` is relative to `UPLOAD_DIR`: `yyyy/mm/{uuid}.{ext}`, plus `{uuid}.thumb.webp`.
- `Message.uploadId` (indexed, **not unique**) links a message to its file. **Shared-upload rule:** several messages may reference one `Upload` (saved copies share it; the file is never duplicated on disk). An upload and its files are deleted only when **no** message references it any more and it isn't an avatar: `purgeMessages()` re-checks after deleting its messages, and the cleanup job uses `messages: { none: {} }`. Any new code that deletes uploads must follow this.
- `ChatMessage.media` is a `ChatMedia`: `{ id, kind, url, thumbUrl, mime, width, height, duration, placeholder, waveform, originalName, size }` (`size` is a number; BigInt in the DB). URLs are always `/api/media/{id}` and `/api/media/{id}/thumb`; never select or send `path`.
- `User.avatarUrl` and `Conversation.avatarUrl` store `/api/media/{uploadId}`, and `avatarThumbUrl()` maps it to the 128px thumb.

**Pipeline:**
1. **Client:** `prepareFile` downscales photos to 2048px JPEG 0.85 (GIFs are kept), then `uploadFile` posts with XHR (progress, abort) to `POST /api/upload?kind=…`. The kind is in the query, so oversized bodies are rejected from `Content-Length` before they're read.
2. **Server:** the Route Handler (`src/app/api/upload/route.ts`) authenticates with the session cookie, then streams the multipart body with **busboy** to `UPLOAD_DIR/tmp` (the size limit is enforced while streaming; nothing is buffered) and detects the real type.
   - **Image (sharp):** EXIF-rotated, metadata stripped, ≤2048px WebP q80. GIFs stay as-is. Each gets a 480px WebP thumb and a 16px placeholder.
   - **Video (ffprobe/ffmpeg):** H.264/AAC MP4 is remuxed with `+faststart`. Anything else (HEVC .mov, WebM) is transcoded to H.264/AAC (`veryfast`, `crf 26`, ≤1280px). A poster frame from ~1s becomes the thumb and placeholder. Rotation is applied to width/height.
   - **Voice:** converted to M4A (AAC mono 64kbps), so Chrome and Safari recordings play everywhere. The duration comes from ffprobe, and the client's peaks are validated and resampled to 48 bars.
   - **Avatar:** 512×512 center-cropped WebP plus a 128×128 thumb.
   - ffmpeg runs at most 2 jobs at a time.
3. **Send:** `sendMessage({ conversationId, uploadId, content?, replyToId?, tempId })`.
   - The upload must be the sender's, not attached to any message yet (checked under a row lock, so two concurrent sends can't both attach it) and not an avatar. Only the server-side save path (`saveMessages`) may attach an already-used upload. The message type comes from the upload kind.
   - The content becomes an optional caption (≤1000 chars).
4. **Client flow:** `useMediaSender` shows optimistic bubbles from local object URLs, with a progress ring, cancel during upload/processing, and retry on failure (re-uploading only if needed).
   - Uploads run in parallel, but messages are sent in **selection order**.
   - Media messages use the same `tempId` / dedupe / realtime path as text.

**Serving and access** (`/api/media/[uploadId]`, `/thumb`; excluded from `proxy.ts` because Next limits bodies passing through the proxy, so these handlers authenticate themselves):
- `AVATAR`: any signed-in user.
- A message's file: users who can **see at least one** message that references it (the visibility rule, so not after "delete for me" or "clear history"; copies count).
- An upload not attached to a message yet: its uploader (their pending optimistic message).
- Everything else, unknown ids included, gets 404; no session gets 401.
- Files stream from disk with HTTP Range (206/416), HEAD, `ETag` (304) and `Cache-Control: private, max-age=31536000, immutable`. They're never served statically.

**Cleanup:** `src/server/media-cleanup.ts` runs hourly in the custom server. It deletes uploads (rows and files) older than 24h that no message references and that aren't a user or group avatar, and `UploadSession`s not updated for 24h with their temp files. This covers abandoned sends and replaced avatars; files of deleted messages and conversations are unlinked right away by the deletion code (see Deleting). It also clears stale temp files.

**UI:**
- **Images:** a fixed aspect-ratio frame with the blur placeholder, then the thumb (the original for GIFs). The caption goes underneath, or the time overlays the image when there's no caption. Tapping opens `yet-another-react-lightbox` (zoom, download, pull down to close).
- **Video:** a poster with a play icon and an `m:ss` duration badge. Tapping opens a full-screen native player (`playsInline`, `autoplay`).
- **Voice:** the mic replaces send when the composer is empty.
  - Recording (`useVoiceRecorder`): hold to record, slide toward the inline start to cancel, slide up to lock. A tap shows a hint. Recordings under 1s are discarded, and recording stops automatically at 5 minutes.
  - Playback: the waveform doubles as the seek bar, there's a 1x / 1.5x / 2x toggle, and `audioManager` makes sure only one voice plays at a time.
- **Previews:** "📷 Photo", "🎬 Video", "🎤 Voice message (m:ss)", "📎 {originalName}" (middle-truncated, `shortFileName`), "📍 Location" (+ label), with the caption when there is one. Quotes and the reply bar show a thumbnail (a tiny map for locations).
- **Media direction:** playback controls and timelines stay LTR (play icon, waveform direction).

**Avatars:**
- `AvatarEditor` (profile page; group info for admins) uploads `AVATAR`, then calls `setProfilePhoto` / `setGroupPhoto`.
- `setGroupPhoto` is admin-only, records `photo_changed` and emits `conversation:updated { avatarUrl }`.
- `setProfilePhoto` emits `user:updated` to everyone who shares a conversation with the user or has them as a contact.
- `UserAvatar` (client) reads live overrides from `store.avatars` (keyed by user id or group id), uses the 128px thumb for small sizes, and falls back to initials while loading or on error.

### Files (documents, "send without compression")

**Rule: no processing.** A FILE is stored and served byte-for-byte as uploaded: no resizing, re-encoding, metadata stripping or conversion. Any type is allowed, up to `MAX_FILE_SIZE_MB` (env, default 2048; read at runtime by `maxFileSize()` in `lib/upload/server.ts`, the authority, and copied at build time into `NEXT_PUBLIC_MAX_FILE_SIZE_MB` by `next.config.ts` for the early client check).
- **Sources:** Attach → "File" (no `accept`, multiple, up to 10), or the photo/video preview's "Send without compression (as files)" switch, which sends `PreparedFile.original` instead of the compressed pipeline.
- **Storage:** `yyyy/mm/{uuid}` with **no extension and no user-controlled name**. The original name lives only in `Upload.originalName`, sanitized by `sanitizeFileName()` (`lib/upload/filename.ts`): basename only, no path separators, control characters or bidi controls (U+202A–U+202E, U+2066–U+2069, U+200E/F), ≤255 chars keeping the extension, fallback "File".
- **Thumbnail:** only for images sharp can read and ≤50MB (`FILE_THUMB_MAX_SOURCE`), never SVG; the original is untouched.
- **Limits** (on session creation): at most 3 active sessions per user, 10GB uploaded per user per hour (also checked per chunk), the existing upload count limiter, and free disk (`fs.statfs` on `UPLOAD_DIR`) minus every active session's remaining bytes must leave 2GB (else 507 "Not enough space on the server").

**Resumable chunk protocol** (contract in `src/lib/upload/protocol.ts`; routes in `src/app/api/upload/files/`, auth inside, excluded from `proxy.ts` through the `api/upload` prefix):

| Request | Does |
|---|---|
| `POST /api/upload/files` `{ name, size, mime }` | validates limits and disk, creates an `UploadSession` with an empty temp file → `{ sessionId, chunkSize: 8MB, receivedSize: 0 }` |
| `PUT /api/upload/files/{id}?offset=n` (raw bytes, ≤8MB) | owner only; `offset` must equal `receivedSize` (else **409** with the current one); streamed to the temp file at the offset; rejects bodies past `totalSize`; an interrupted chunk commits nothing → `{ receivedSize }` |
| `GET /api/upload/files/{id}` | `{ receivedSize, totalSize }` for resuming |
| `POST /api/upload/files/{id}/complete` | needs all bytes; MIME from `file-type` (fallback: the client's, then `application/octet-stream`); moves the file to its final path, creates the `Upload` (kind FILE), deletes the session → `{ media }` |
| `DELETE /api/upload/files/{id}` | cancel: temp file and session removed |

- Session temp files live in `UPLOAD_DIR/upload-sessions/{id}.part` (not `tmp/`, whose 1-hour sweep would kill paused uploads). The hourly cleanup removes sessions not updated for 24h with their files. Per-session locks (`globalThis.__uploadLocks`) reject concurrent PUT/complete with 409.
- The message is created only after `complete`: `sendMessage({ uploadId, tempId })` as for other media; until then it's only the sender's optimistic bubble.

**Client** (`lib/upload/resumable.ts`, `hooks/use-file-sender.ts`): `File.slice` chunks over XHR (progress within a chunk), one chunk at a time, at most 2 files in parallel (the rest queue); retries with backoff 1s, 2s, 5s, 10s, then every 15s; 409 resumes from the server's `receivedSize`; `offline` pauses ("Waiting for connection…") and `online` resumes; active sessions are kept in localStorage, so after a reload the bubble shows "Upload paused" and "Resume" re-picks the file (matched by name, size, lastModified) and continues; a Wake Lock is held while uploading. Messages are sent in selection order.

**Serving** (`/api/media/{id}` for FILE): the same access rule as other media (membership + visibility), Range/HEAD/ETag, streamed from disk, plus `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<encoded>`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`. Script-capable types (HTML, SVG, XML, JavaScript, …) are served as `application/octet-stream`. FILE is never rendered inline on our origin.

**Bubble** (`FileMedia`): a colored type icon (`file-kind.ts`) or the thumbnail, the name (`dir="auto"`, middle-truncated keeping the extension), the size (`formatBytes`: "850 KB", "2.4 MB", "1.4 GB"), caption, and a download link (`<a href download>`; a new tab in the iOS standalone PWA). Playable audio (mp3, m4a, ogg, wav) gets a play button on the shared `audioManager`. FILE videos are download-only. While uploading: a progress ring with cancel and "Uploading … {sent} of {total}" / "Waiting for connection…" / "Upload paused".

## Location

- `MessageType.LOCATION` with `Message.latitude`, `longitude` (6 decimals) and optional `locationLabel` (≤200). `sendMessage({ location: { latitude, longitude, label? } })`, validated by `locationSchema` (lat −90..90, lng −180..180); content may be empty. Same optimistic/tempId/`message:new` path as text.
- **Map config** (`src/lib/map/config.ts`, **build-time** `NEXT_PUBLIC_*`, passed as Docker build args): `NEXT_PUBLIC_MAP_TILE_URL` (template with `{z}/{x}/{y}`, optional `{s}`), `NEXT_PUBLIC_MAP_SUBDOMAINS`, `NEXT_PUBLIC_MAP_ATTRIBUTION`, `NEXT_PUBLIC_MAP_MAX_ZOOM`. Empty strings count as unset. The OpenStreetMap default is for development only (its tile policy forbids heavy use); production uses a provider with its own key (DEPLOY.md, "Map tiles"). Tiles load without `crossOrigin`.
- **Leaflet** (react-leaflet) only in the lazily loaded picker and viewer (`next/dynamic`, no SSR), which import the Leaflet CSS themselves. Map containers are `dir="ltr"`. Markers are `divIcon`/SVG (no default image icons).
- **Bubble** (`LocationMedia`): no Leaflet instance; a 2×2 block of zoom-15 tiles positioned with CSS so the point is centered, a pin overlay and tiny attribution, fixed 4:3 frame, lazy images; then the label and coordinates. `LocationThumb` is the small version for quotes and the reply bar.
- **Picker:** current position (high accuracy, 10s timeout) with a blue dot and accuracy circle, a fixed center pin (drag the map), "My location", "Send my current location" (with accuracy) or "Send this point", optional "Place name". Denied/unavailable geolocation (e.g. not HTTPS) shows an explanation and manual picking still works.
- **Viewer:** interactive map with the marker, "My location" (distance via haversine, "1.2 km"), "Open in…" (Google Maps, Neshan, Balad, `geo:` from `src/lib/map-links.ts`) and "Copy coordinates".
- LOCATION and FILE messages follow the hard-delete and visibility rules like every other message (deleting a FILE message removes its file and thumbnail).

## Channels

Telegram-style broadcast channels. A channel is a `Conversation` with `type: CHANNEL`: admins publish, subscribers (role `MEMBER`) only read. They reuse the conversation, message types, upload, hard-delete, visibility and realtime layers; code branches on `conversation.type` where behavior differs.

- **Schema:** `Conversation.description` (≤255), `inviteToken` (unique), `signMessages`, `ownerId` (the single owner); `ConversationMember.muted` (all types, see Muting).
- **Join:** an admin adds people **from their contacts**, or a person opens an invite link. Capacity is `MAX_CHANNEL_MEMBERS`. No join/leave/add/remove system messages exist. System messages in channels are only `created`, `renamed`, `photo_changed` and `history_cleared`, and their text never names the actor (`systemMessageText(..., "CHANNEL")`).
- **Where:** `src/lib/chat/channels.ts` (server-only; rules, all checks inside the transaction, `ChannelError`), `src/app/(app)/chats/channel-actions.ts` (create/update/add/remove/role/leave/transfer/delete/invite/list/join; `requireUser` → zod → transaction → events), `setChannelPhoto` in `photo-actions.ts`, `lib/validations/channels.ts`. **UI hiding is cosmetic; the server is the authority.**

### Permissions (enforced on the server)

| Action | Member | Admin | Owner |
|---|---|---|---|
| Read posts, mute/unmute, clear history for me, leave | ✓ | ✓ | ✓ (see leaving) |
| Send posts (all message types), reply, typing events | ✗ | ✓ | ✓ |
| Delete any post for everyone, clear history for everyone | ✗ | ✓ | ✓ |
| See the member list, add members from contacts, remove members | ✗ | ✓ | ✓ |
| Edit title/description/photo, toggle `signMessages`, create/reset invite link | ✗ | ✓ | ✓ |
| Promote a member to admin | ✗ | ✓ | ✓ |
| Demote or remove an admin, transfer ownership, delete the channel | ✗ | ✗ | ✓ |

- `sendMessage` rejects non-admins (`canPost`); typing events from non-admins are dropped by the socket server (roles come from the membership cache). Replies are part of sending.
- The owner can't be removed or demoted. If the owner leaves, ownership moves to the longest-standing other admin (`joinedAt`, then `userId`); with no other admin, leaving is refused ("Appoint another admin first or delete the channel").
- **Transfer ownership** needs the owner's password (bcrypt, `LIMITS.passwordFailures`); the target must already be an admin; the old owner stays an admin.

### Privacy (subscribers must never learn who else is in the channel)

For non-admins, no payload (page props, Server Action result, socket event) may contain the member list, member ids, other members' presence, or which admin posted:
- `ChatConversation.members` / `readStates` are always empty for channels; `conversationSelectFor(userId)` loads only the viewer's own member row for a channel (never 10k users). `ChatConversation` carries `myRole`, `isOwner` (boolean, never the owner's id), `memberCount`, `muted`, `description`, `signMessages` instead.
- The only way to list people is `listChannelMembers` (admins only, 50 per page, search by name/username, keyset cursor). Admins and the invite token come from `getChannelInfo` and are empty for subscribers.
- **Post author:** `toChatMessage(row, viewer)` (and `toMemberView` in `channel-view.ts`, used by `emitMessageNew`) replaces `sender` for non-admins with the channel identity (`id` = conversation id, name = title, channel avatar). With `signMessages` on, `ChatMessage.signature` holds only the admin's display name (no id, no username). Quotes' `senderName` and system-message `meta` (`actorId`/`actorName`) get the same treatment, and so does the chat-list preview (`getConversations`). Admins see the real sender.
- `message:new` is built **per audience**: admin version to admins, subscriber version to subscribers. `conversation:read` stays on the reader's own rooms. `presence:subscribe` never returns anyone from a channel unless the viewer is an admin of it (`getWatchablePresence`). `user:updated` (profile photo) reaches only a channel's admins.
- Typing is visible to other admins only.

### Views

`ChatMessage.views` = the number of current members whose `lastReadAt >= post.createdAt` (the author counts), computed for a page of posts in one SQL query (`lib/chat/views.ts`, no table). New posts start at 1. They are **not** pushed per read: the open channel polls `getChannelStats` every 30s (visible tab only) for the loaded posts and the subscriber count. Shown as `Eye` + `formatCompactNumber` ("1.2K").

### Invite links

- Token: `randomBytes(24).toString("base64url")` (32 chars). Admins create (on first use), copy, share (`navigator.share`, else copy) and reset it from the info page; reset replaces the token, so the old link dies at once. The token is only ever sent to admins.
- `/join/[token]` (`proxy.ts` sends logged-out users to `/login?from=…` and back): preview card (avatar, title, "Channel", subscriber count, description) with "Join channel"; already a member → redirect to the channel; unknown/reset token → "This invite link isn't valid". Rate limits: `LIMITS.badInviteLinks` (unknown tokens per user and IP) on the page, `LIMITS.channelJoins` (every join attempt per user and IP) in `joinChannel`. A full channel says "This channel is full".
- Joining and being added emit `conversation:joined` to the user's rooms (no system message); admins get `membersChanged`.

### Muting (all conversation types)

`ConversationMember.muted`, toggled by `setMuted` ("Mute" / "Unmute": header menu, chat-list row menu, info pages, and the subscribers' bottom bar in channels). Muted conversations play no notification sound, don't count in `selectTotalUnread` (tab badge, title, app icon), show their unread badge in gray and a `BellOff` icon next to the name. Other tabs follow through `conversation:updated { muted }` to the user's own rooms.

### UI

- New channel: "New channel" (megaphone) in the chat-list sheet → `/chats/new-channel` (step 1 photo, name, description; step 2 pick subscribers or "Skip").
- Chat list: megaphone next to the name, no sender prefix in the preview.
- Channel page = the same `ChatView`: subtitle "{n} subscribers" (no presence); posts render as full-width cards (`channelTitle` on `MessageBubble`: channel name on the first post of a run, content, caption, footer with signature/author, views and time; no read ticks, no avatars). Admins get the normal composer; subscribers a single full-width "Mute" / "Unmute" button instead. Subscribers' message menu: "Copy text" and "Download" only; admins also "Reply", "Select", "Delete".
- Info page (`ChannelInfoView`): large avatar, name, "Channel", subscriber count, description with safe links (`LinkifiedText`: http/https only, `rel="noopener noreferrer"`), mute switch. Admins also get invite link tools, the "Sign posts" switch, edit name/description/photo, "Add subscribers", admin and subscriber lists with search and per-person actions. The owner gets "Transfer ownership" and "Delete channel". Everyone gets "Clear history" and "Leave channel".

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
| S→C | `conversation:read` | `{ conversationId, userId, lastReadAt }` | `user:{id}` of every member (channels: only the reader's own rooms) |
| S→C | `typing:start` / `typing:stop` | `{ conversationId, userId, name }` | `user:{id}` of the other members (channels: other admins only) |
| S→C | `presence:update` | `{ userId, online, lastSeenAt }` | `presence:{userId}` |
| S→C | `conversation:updated` | `{ conversationId, title?, avatarUrl?, members?, description?, signMessages?, memberCount?, membersChanged?, myRole?, isOwner?, muted? }` | `user:{id}` of every member, after rename / photo / membership / role changes. Channels: `members`, `memberCount`, `membersChanged` go to admins only; `myRole`/`isOwner`/`muted` only to the user they describe |
| S→C | `conversation:joined` | `{ conversationId }` | the joining user's own rooms (added to a channel or joined by invite link); the client fetches the list row. No system message |
| S→C | `user:updated` | `{ userId, name?, avatarUrl? }` | `user:{id}` of everyone sharing a conversation with the user or having them as a contact |
| S→C | `conversation:removed` | `{ conversationId, reason: "removed" \| "left" \| "deleted" }` | `user:{id}` of the former member(s) |
| S→C | `message:deleted` | `{ conversationId, messageIds }` | for everyone: `user:{id}` of every member; for me: my own `user:{id}` (other tabs/devices) |
| S→C | `conversation:cleared` | `{ conversationId, forEveryone, before }` | the affected users' rooms (me, or every member); everything at or before `before` is gone |
| S→C | `conversation:deleted` | `{ conversationId }` | `user:{id}` of every former member when the conversation is hard-deleted; their sockets leave `conv:{id}` |
| C→S | `conversation:join` (ack `{ ok }`) / `conversation:leave` | `conversationId` | joins/leaves `conv:{id}` after a membership check |
| C→S | `typing:start` / `typing:stop` | `conversationId` | membership-checked; `start` ignored if faster than 1/s per socket |
| C→S | `presence:subscribe` (ack: states) / `presence:unsubscribe` | `{ userIds }` | joins `presence:{id}`; only for people I share a conversation with or have as contacts |

**Rooms** (`userRoom`, `conversationRoom`, `presenceRoom`):
- `user:{id}`: every socket of a user, joined on connect. All per-user delivery goes here.
- `conv:{id}`: sockets with that chat open.
- `presence:{id}`: watchers of a user's status.

Typing goes to user rooms rather than `conv:{id}` so the chat list can show it too.

**Auth:** the handshake reads the httpOnly `session` cookie and verifies it with `verifySession` (`session-token.ts`), then sets `socket.data.userId` and `socket.data.name`. Invalid or missing sessions are rejected with `unauthorized`.

**Membership:** every client event that names a conversation is checked with `isConversationMember` (`lib/realtime/membership.ts`). The 60s in-memory cache (`getMembership`) holds the conversation type, the member ids **and the admin ids**; call `invalidateMembership(id)` when members or roles change.

**Emitting from Server Actions:** use `emitToMembers(conversationId, event, payload)` (`lib/realtime/emit.ts`). It's a no-op without a socket server, so mutations never fail because of realtime.
- Every fan-out goes through `emitChunked`: rooms in batches of 500 with a `setImmediate` yield between, so a 10k-subscriber channel never blocks the event loop.
- `emitToAdmins` / `emitToSubscribers` / `emitRead` / `emitMessageNew` are the role-aware variants. **A new message must go out through `emitMessageNew`** (it builds the admin and subscriber versions for channels, and handles per-recipient hidden quotes).
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
  - Unread counts live in the separate unread store and don't grow for the open, visible conversation.
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
  - Security headers; Permissions-Policy allows camera, microphone and geolocation for self.
  - `/api/upload/*` is not compressed; request bodies stream to the app (8MB FILE chunks fit the 60MB limit); 10-minute timeouts for slow mobile chunks (the Node server's `requestTimeout` matches).
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
- **`EDIT_WINDOW_HOURS`** (runtime, default 48): how long a DIRECT/GROUP message can be edited. Validated in `src/server/env.ts`; documented in `.env.example`, `.env.production.example` and DEPLOY.md §5.
- **`MAX_CHANNEL_MEMBERS`** (runtime, default 10000): the most subscribers a channel can have; checked inside the add/join transaction (`assertCapacity`). Validated in `src/server/env.ts`; documented in `.env.example`, `.env.production.example` and DEPLOY.md §5.
- **Rule: every new env var** must be added to `.env.example`, `.env.production.example` (commented) **and** the table in `DEPLOY.md` §5. If the container needs a fixed value, set it in `docker-compose.prod.yml`.
  - Build-time variables (`NEXT_PUBLIC_*`, and `MAX_FILE_SIZE_MB` for the client check) must also be passed as `build.args` in `docker-compose.prod.yml` and declared as `ARG`/`ENV` in the Dockerfile build stage; changing them needs a rebuild.
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
