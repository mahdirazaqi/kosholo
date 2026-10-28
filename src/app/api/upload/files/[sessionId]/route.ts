import { appendChunk, cancelSession, sessionStatus } from "@/lib/upload/server";
import { handleFileUpload } from "@/lib/upload/respond";

type Context = RouteContext<"/api/upload/files/[sessionId]">;

// PUT /api/upload/files/{id}?offset=n  <raw chunk bytes> → { ok, receivedSize }
export async function PUT(request: Request, { params }: Context) {
  const { sessionId } = await params;
  return handleFileUpload((userId) =>
    appendChunk(
      userId,
      sessionId,
      new URL(request.url).searchParams.get("offset"),
      request.headers.get("content-length"),
      request.body,
    ),
  );
}

// GET → { ok, receivedSize, totalSize } (resume after a reload or a dropped connection)
export async function GET(_request: Request, { params }: Context) {
  const { sessionId } = await params;
  return handleFileUpload((userId) => sessionStatus(userId, sessionId));
}

// DELETE → { ok } (cancel: the temp file and the session are removed)
export async function DELETE(_request: Request, { params }: Context) {
  const { sessionId } = await params;
  return handleFileUpload(async (userId) => {
    await cancelSession(userId, sessionId);
    return {};
  });
}
