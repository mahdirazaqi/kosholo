// Resumable FILE upload protocol, shared by the route handlers
// (src/app/api/upload/files/**) and the client manager (lib/upload/resumable.ts).
// All bodies are JSON except the PUT chunk (raw bytes, not multipart).
//
//   POST   /api/upload/files                 { name, size, mime } → CreateSessionResponse
//   PUT    /api/upload/files/{id}?offset=n   <chunk bytes, ≤ chunkSize> → ChunkResponse
//          offset must equal the server's receivedSize, else 409 with the current one
//   GET    /api/upload/files/{id}            → SessionStatusResponse
//   POST   /api/upload/files/{id}/complete   → CompleteResponse (creates the Upload, kind FILE)
//   DELETE /api/upload/files/{id}            → { ok: true } (cancel: temp file and session removed)
//
// Errors are { ok: false, error } with a user-facing message (401 not signed
// in, 404 unknown/foreign session, 413 too large, 429 limits, 507 no disk space).
import type { ChatMedia } from "@/lib/types/chat";

export const FILE_UPLOAD_BASE = "/api/upload/files";

export type CreateSessionRequest = { name: string; size: number; mime: string };

type Failure = { ok: false; error: string };

export type CreateSessionResponse = { ok: true; sessionId: string; chunkSize: number; receivedSize: number } | Failure;
export type ChunkResponse = { ok: true; receivedSize: number } | (Failure & { receivedSize?: number });
export type SessionStatusResponse = { ok: true; receivedSize: number; totalSize: number } | Failure;
export type CompleteResponse = { ok: true; media: ChatMedia } | Failure;
