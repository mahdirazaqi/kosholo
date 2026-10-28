import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canReadUpload } from "@/lib/media/access";
import { safeDownloadMime, serveFile } from "@/lib/media/serve";
import { absolutePath } from "@/lib/media/storage";
import { isUuid } from "@/lib/realtime/membership";
import { contentDisposition } from "@/lib/upload/filename";

// Shared by GET/HEAD /api/media/[uploadId] and /thumb. Auth happens here (these
// routes are excluded from the proxy). Unknown and forbidden both answer 404
// so upload ids can't be probed.
export async function serveUpload(request: Request, uploadId: string, variant: "main" | "medium" | "thumb") {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isUuid(uploadId)) return new Response("Not found", { status: 404 });

  const upload = await db.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, kind: true, ownerId: true, path: true, thumbPath: true, mediumPath: true, mime: true, originalName: true },
  });
  if (!upload || !(await canReadUpload(upload, user.id))) {
    return new Response("Not found", { status: 404 });
  }

  if (variant === "thumb") {
    if (!upload.thumbPath) return new Response("Not found", { status: 404 });
    return serveFile(request, absolutePath(upload.thumbPath), "image/webp", `"${upload.id}-thumb"`);
  }
  if (variant === "medium") {
    // Profile photos have a 640px size; other images (group photos) fall back to the original.
    return serveFile(request, absolutePath(upload.mediumPath ?? upload.path), upload.mediumPath ? "image/webp" : upload.mime, `"${upload.id}-medium"`);
  }
  if (upload.kind === "FILE") {
    // Original bytes, always as a download (never rendered on our origin),
    // with the original name; script-capable types as opaque bytes.
    return serveFile(
      request,
      absolutePath(upload.path),
      safeDownloadMime(upload.mime),
      `"${upload.id}"`,
      contentDisposition(upload.originalName ?? "File"),
    );
  }
  return serveFile(request, absolutePath(upload.path), upload.mime, `"${upload.id}"`);
}
