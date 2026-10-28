import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { uploadIdFromUrl } from "@/lib/media/serialize";
import { absolutePath, removeFiles, uploadRoot } from "@/lib/media/storage";

const HOUR = 60 * 60 * 1000;
const ORPHAN_AFTER = 24 * HOUR;

// Deletes uploads (rows + files) older than 24h that no message references
// (saved copies share uploads, so "none", not "one") and that
// aren't a user/group avatar: abandoned optimistic sends, replaced avatars,
// and files of messages that were deleted (e.g. a deleted group). Also clears
// stale temp files from interrupted uploads and resumable FILE upload sessions
// not touched for 24h.
export async function cleanupUploads() {
  const cutoff = new Date(Date.now() - ORPHAN_AFTER);
  const [users, conversations] = await Promise.all([
    db.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    db.conversation.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
  ]);
  const avatarIds = new Set(
    [...users, ...conversations].map((row) => uploadIdFromUrl(row.avatarUrl)).filter(Boolean),
  );

  let deleted = 0;
  for (;;) {
    const batch = await db.upload.findMany({
      where: { createdAt: { lt: cutoff }, messages: { none: {} }, id: { notIn: [...avatarIds] as string[] } },
      select: { id: true, path: true, thumbPath: true },
      take: 200,
    });
    if (batch.length === 0) break;
    await Promise.all(batch.map((upload) => removeFiles(upload.path, upload.thumbPath)));
    await db.upload.deleteMany({ where: { id: { in: batch.map((upload) => upload.id) } } });
    deleted += batch.length;
    if (batch.length < 200) break;
  }

  const tmpDir = path.join(uploadRoot(), "tmp");
  const tmpFiles = await readdir(tmpDir).catch(() => [] as string[]);
  for (const file of tmpFiles) {
    const full = path.join(tmpDir, file);
    const info = await stat(full).catch(() => null);
    if (info && Date.now() - info.mtimeMs > HOUR) await rm(full, { force: true });
  }

  if (deleted) logger.info("media", `cleanup removed ${deleted} unused upload(s)`);

  const sessions = await removeStaleSessions(cutoff);
  if (sessions) logger.info("media", `cleanup removed ${sessions} abandoned upload session(s)`);
}

// Sessions with a request in progress are locked by lib/upload/server.ts
// (same globalThis, same process) and skipped.
const uploadLocks = () => (globalThis as unknown as { __uploadLocks?: Set<string> }).__uploadLocks;

async function removeStaleSessions(cutoff: Date) {
  const stale = await db.uploadSession.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { id: true, tempPath: true },
  });
  let removed = 0;
  for (const session of stale) {
    if (uploadLocks()?.has(session.id)) continue;
    await rm(absolutePath(session.tempPath), { force: true }).catch(() => {});
    await db.uploadSession.delete({ where: { id: session.id } }).catch(() => {});
    removed++;
  }
  return removed;
}

// Returns a function that stops the job (graceful shutdown).
export function startMediaCleanup() {
  const run = () => cleanupUploads().catch((error) => logger.error("media", "cleanup failed", error));
  const first = setTimeout(run, 30_000);
  const hourly = setInterval(run, HOUR);
  first.unref();
  hourly.unref();
  return () => {
    clearTimeout(first);
    clearInterval(hourly);
  };
}
