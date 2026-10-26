import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { uploadIdFromUrl } from "@/lib/media/serialize";
import { removeFiles, uploadRoot } from "@/lib/media/storage";

const HOUR = 60 * 60 * 1000;
const ORPHAN_AFTER = 24 * HOUR;

// Deletes uploads (rows + files) older than 24h that no message uses and that
// aren't a user/group avatar: abandoned optimistic sends, replaced avatars,
// and files of messages that were deleted (e.g. a deleted group). Also clears
// stale temp files from interrupted uploads.
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
      where: { createdAt: { lt: cutoff }, message: null, id: { notIn: [...avatarIds] as string[] } },
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

  if (deleted) console.log(`[media] cleanup removed ${deleted} unused upload(s)`);
}

export function startMediaCleanup() {
  const run = () => cleanupUploads().catch((error) => console.error("[media] cleanup failed", error));
  setTimeout(run, 30_000);
  setInterval(run, HOUR).unref();
}
