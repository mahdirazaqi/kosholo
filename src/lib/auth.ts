import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Fields that are safe to hand to Server and Client Components.
// passwordHash is never selected here.
const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export type CurrentUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
};

// Reads and verifies the session cookie, then loads the user.
// Deduplicated per request with React cache().
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  return db.user.findUnique({
    where: { id: session.userId },
    select: publicUserSelect,
  });
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
