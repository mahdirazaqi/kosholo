import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { UploadError } from "@/lib/upload/server";

// Shared by the /api/upload/files route handlers (excluded from the proxy, so
// they authenticate here). Responses follow lib/upload/protocol.ts.
export async function handleFileUpload(work: (userId: string) => Promise<object>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Please log in first" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await work(user.id)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json(
        { ok: false, error: error.message, ...(error.receivedSize !== undefined ? { receivedSize: error.receivedSize } : {}) },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    logger.error("upload", "file upload request failed", error);
    return Response.json({ ok: false, error: "Couldn't upload the file" }, { status: 500 });
  }
}
