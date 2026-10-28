import "server-only";

import { headers } from "next/headers";

// The client IP for rate limiting. In production the app is only reachable
// through Caddy, which sets X-Forwarded-For to the real client address
// (ignoring whatever the client sent); we only trust that first proxy hop,
// i.e. the right-most entry. Without a proxy the custom server fills the
// header from the socket address.
export async function getClientIp() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || "unknown";
}
