import { completeSession } from "@/lib/upload/server";
import { handleFileUpload } from "@/lib/upload/respond";

// POST /api/upload/files/{id}/complete → { ok, media } (an Upload of kind FILE;
// the client then sends it with sendMessage({ uploadId })).
export async function POST(_request: Request, { params }: RouteContext<"/api/upload/files/[sessionId]/complete">) {
  const { sessionId } = await params;
  return handleFileUpload(async (userId) => ({ media: await completeSession(userId, sessionId) }));
}
