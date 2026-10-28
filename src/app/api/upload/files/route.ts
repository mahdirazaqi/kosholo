import { createSession, UploadError } from "@/lib/upload/server";
import { handleFileUpload } from "@/lib/upload/respond";

// POST /api/upload/files { name, size, mime } → { ok, sessionId, chunkSize, receivedSize }
// Starts a resumable FILE upload (protocol: lib/upload/protocol.ts).
export async function POST(request: Request) {
  return handleFileUpload(async (userId) => {
    const body = await request.json().catch(() => {
      throw new UploadError(400, "Invalid request");
    });
    return createSession(userId, body);
  });
}
