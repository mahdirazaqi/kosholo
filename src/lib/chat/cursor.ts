// Message cursors: the composite position (createdAt, id) of a message, as an
// opaque string. Client-safe (the client builds them from messages it already
// has); the server only trusts decodeCursor's result, never a message row id.
export type MessageCursor = { createdAt: Date; id: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(message: { createdAt: string | Date; id: string }) {
  const iso = message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt;
  return btoa(`${iso}|${message.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: unknown): MessageCursor | null {
  if (typeof cursor !== "string" || cursor.length > 120) return null;
  try {
    const base64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const [iso, id] = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)).split("|");
    if (!ISO.test(iso) || !UUID.test(id)) return null;
    const createdAt = new Date(iso);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
  } catch {
    return null;
  }
}
