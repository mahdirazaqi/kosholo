"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { updateProfileSchema } from "@/lib/validations/auth";

// Saves my display name. A plain action (not a form action) so the client can
// queue it offline and send it again later; a validation failure returns an
// `error` (never retried), a transient failure returns { ok: false }.
export async function saveName(name: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse({ name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid name" };
  try {
    await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  } catch (error) {
    logger.error("saveName", "failed", error);
    return { ok: false };
  }
  revalidatePath("/settings");
  return { ok: true };
}
