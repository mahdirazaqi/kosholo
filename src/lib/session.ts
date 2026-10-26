import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { getSecret, SESSION_COOKIE } from "@/lib/session-token";

// Edge-compatible session helpers: jose only, no Prisma. Safe to import from
// src/proxy.ts as well as Server Components and Server Actions.
// Token verification lives in session-token.ts (also used by the socket server).
export { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/session-token";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
