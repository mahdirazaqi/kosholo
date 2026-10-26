// Files live under UPLOAD_DIR as yyyy/mm/{uuid}.{ext} (paths in the DB are
// relative). Never under /public: everything is served by /api/media with
// access checks. No "server-only": the custom server's cleanup job uses this.
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export function uploadRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./uploads");
}

export function absolutePath(relative: string) {
  const root = uploadRoot();
  const full = path.resolve(root, relative);
  // Defense in depth: never resolve outside the upload root.
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid upload path");
  return full;
}

// Reserves a new relative path (and creates its directory).
export async function newFilePath(ext: string, id: string = randomUUID(), suffix = "") {
  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const relative = `${dir}/${id}${suffix}.${ext}`;
  await mkdir(path.join(uploadRoot(), dir), { recursive: true });
  return { relative, absolute: absolutePath(relative) };
}

export async function tempFilePath(ext = "bin") {
  const dir = path.join(uploadRoot(), "tmp");
  await mkdir(dir, { recursive: true });
  return path.join(dir, `${randomUUID()}.${ext}`);
}

export async function removeFiles(...relatives: (string | null | undefined)[]) {
  await Promise.all(
    relatives.filter((r): r is string => Boolean(r)).map((r) => rm(absolutePath(r), { force: true }).catch(() => {})),
  );
}
