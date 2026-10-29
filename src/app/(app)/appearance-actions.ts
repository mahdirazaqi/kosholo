"use server";

import { requireUser } from "@/lib/auth";
import { type Appearance, normalizeAppearance } from "@/lib/appearance/settings";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isRateLimited, LIMITS, recordHit } from "@/lib/rate-limit";
import { userRoom } from "@/lib/realtime/events";
import { appearanceSchema } from "@/lib/validations/appearance";
import { tryGetIO } from "@/server/io";

// Theme, wallpaper and text size follow the account across devices. The display
// mode (system/light/dark) is per device and never reaches the server.

export async function getAppearance(): Promise<Appearance> {
  const me = await requireUser();
  const row = await db.user.findUnique({ where: { id: me.id }, select: { appearance: true } });
  return normalizeAppearance(row?.appearance);
}

export async function saveAppearance(input: unknown): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const key = `appearance:${me.id}`;
  if (isRateLimited(key, LIMITS.appearance)) return { ok: false };
  recordHit(key, LIMITS.appearance);

  // Unknown ids fall back to the defaults instead of being stored.
  const parsed = appearanceSchema.safeParse(input);
  const appearance = parsed.success ? parsed.data : normalizeAppearance(null);
  try {
    await db.user.update({ where: { id: me.id }, data: { appearance } });
  } catch (error) {
    logger.error("appearance", "save failed", error);
    return { ok: false };
  }
  // Only my own devices hear about it.
  tryGetIO()?.to(userRoom(me.id)).emit("user:updated", { userId: me.id, appearance });
  return { ok: true };
}
