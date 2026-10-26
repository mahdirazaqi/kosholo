import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic route protection: verifies the JWT signature only (no DB).
// Pages and Server Actions still authorize with requireUser().

const AUTH_ROUTES = ["/login", "/register"];
// Reachable signed in or out (precached by the service worker).
const PUBLIC_ROUTES = ["/~offline"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isAuthRoute && !session) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname + search);
    const response = NextResponse.redirect(loginUrl);
    // Drop an invalid or expired cookie so it isn't re-verified on every request.
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, Socket.IO, files with an extension and
    // the media routes: Next limits bodies passing through the proxy, so
    // /api/upload and /api/media authenticate inside their handlers.
    // /api/health is public (health checks).
    "/((?!_next/|socket\\.io|api/upload|api/media|api/health|favicon\\.ico|.*\\.[\\w]+$).*)",
  ],
};
