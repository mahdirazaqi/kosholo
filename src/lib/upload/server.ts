import "server-only";

import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat, statfs, truncate } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromFile } from "file-type";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  DISK_HEADROOM,
  FILE_BYTES_PER_HOUR,
  FILE_CHUNK_SIZE,
  MAX_ACTIVE_UPLOAD_SESSIONS,
  MEDIA_ERRORS,
  UPLOAD_RATE,
} from "@/lib/media/limits";
import { fileThumbnail } from "@/lib/media/process";
import { chatMediaSelect, toChatMedia } from "@/lib/media/serialize";
import { absolutePath, newBareFilePath, removeFiles, sessionTempPath, uploadRoot } from "@/lib/media/storage";
import { isRateLimited, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/realtime/membership";
import type { ChatMedia } from "@/lib/types/chat";
import { sanitizeFileName } from "@/lib/upload/filename";

// Resumable FILE uploads (protocol: lib/upload/protocol.ts). A session owns a
// temp file that chunks are appended to; `complete` turns it into an Upload
// of kind FILE with the original bytes untouched. Route handlers call these
// and map UploadError to { ok: false, error } with its status.

export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
    public receivedSize?: number,
  ) {
    super(message);
  }
}

const MB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const NOT_FOUND = "Upload not found; please send the file again";

// The authority on the size limit, read at runtime (MAX_FILE_SIZE in
// limits.ts is the client's build-time copy).
export function maxFileSize() {
  const mb = Number(process.env.MAX_FILE_SIZE_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 2048) * MB;
}

// ---- Per-user limits (in memory; single long-running process) ----

type Quota = { bytes: number; resetAt: number };
const globals = globalThis as unknown as {
  __uploadQuota?: Map<string, Quota>;
  __uploadLocks?: Set<string>;
};
const quotas = (globals.__uploadQuota ??= new Map());
// Sessions with a chunk or `complete` in progress: a second request for the
// same session waits its turn (409) instead of interleaving writes. The
// cleanup job (src/server/media-cleanup.ts) skips locked sessions.
const locks = (globals.__uploadLocks ??= new Set());

function quotaUsed(userId: string, now = Date.now()) {
  const quota = quotas.get(userId);
  if (!quota || quota.resetAt <= now) return 0;
  return quota.bytes;
}

function addQuota(userId: string, bytes: number) {
  const now = Date.now();
  const quota = quotas.get(userId);
  if (!quota || quota.resetAt <= now) quotas.set(userId, { bytes, resetAt: now + 60 * 60 * 1000 });
  else quota.bytes += bytes;
}

async function withLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  if (locks.has(sessionId)) {
    const session = await db.uploadSession.findUnique({ where: { id: sessionId }, select: { receivedSize: true } });
    throw new UploadError(409, "Another request for this upload is in progress", session ? Number(session.receivedSize) : undefined);
  }
  locks.add(sessionId);
  try {
    return await work();
  } finally {
    locks.delete(sessionId);
  }
}

async function ownSession(sessionId: string, userId: string) {
  if (!isUuid(sessionId)) throw new UploadError(404, NOT_FOUND);
  const session = await db.uploadSession.findUnique({ where: { id: sessionId } });
  // Foreign sessions look exactly like missing ones.
  if (!session || session.ownerId !== userId) throw new UploadError(404, NOT_FOUND);
  return session;
}

// Free bytes on the upload volume.
async function freeDiskSpace() {
  await mkdir(uploadRoot(), { recursive: true });
  const fs = await statfs(uploadRoot());
  return Number(fs.bavail) * Number(fs.bsize);
}

// ---- Create ----

const createSchema = z.object({
  name: z.string().max(4096),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mime: z.string().max(255).optional().default(""),
});

const MIME = /^[\w.+-]+\/[\w.+-]+$/;
const cleanMime = (mime: string) => (MIME.test(mime) ? mime.toLowerCase() : "");

export async function createSession(userId: string, input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new UploadError(400, MEDIA_ERRORS.empty);
  const { size } = parsed.data;

  const max = maxFileSize();
  if (size > max) throw new UploadError(413, MEDIA_ERRORS.fileTooLarge(max));

  const limitKey = `upload:${userId}`;
  if (isRateLimited(limitKey, UPLOAD_RATE)) throw new UploadError(429, RATE_LIMIT_ERROR);

  const since = new Date(Date.now() - DAY);
  const active = await db.uploadSession.count({ where: { ownerId: userId, updatedAt: { gte: since } } });
  if (active >= MAX_ACTIVE_UPLOAD_SESSIONS) throw new UploadError(429, MEDIA_ERRORS.tooManyUploads);
  if (quotaUsed(userId) + size > FILE_BYTES_PER_HOUR) throw new UploadError(429, MEDIA_ERRORS.hourlyQuota);

  // Room for this file, everyone's unfinished uploads, and the headroom.
  const pending = await db.uploadSession.findMany({
    where: { updatedAt: { gte: since } },
    select: { totalSize: true, receivedSize: true },
  });
  const reserved = pending.reduce((sum, s) => sum + Number(s.totalSize - s.receivedSize), 0);
  if ((await freeDiskSpace()) - reserved - size < DISK_HEADROOM) {
    logger.warn("upload", "refused a file upload: not enough disk space");
    throw new UploadError(507, MEDIA_ERRORS.noSpace);
  }

  recordHit(limitKey, UPLOAD_RATE);
  const id = crypto.randomUUID();
  const temp = await sessionTempPath(id);
  await (await open(temp.absolute, "w")).close();
  await db.uploadSession.create({
    data: {
      id,
      ownerId: userId,
      originalName: sanitizeFileName(parsed.data.name),
      mime: cleanMime(parsed.data.mime),
      totalSize: BigInt(size),
      tempPath: temp.relative,
    },
  });
  return { sessionId: id, chunkSize: FILE_CHUNK_SIZE, receivedSize: 0 };
}

// ---- Chunks ----

// Streams one chunk into the temp file at `offset` (never buffering it), then
// truncates anything a previously interrupted chunk left beyond the new end.
export async function appendChunk(
  userId: string,
  sessionId: string,
  offsetParam: string | null,
  contentLength: string | null,
  body: ReadableStream<Uint8Array> | null,
) {
  return withLock(sessionId, async () => {
    const session = await ownSession(sessionId, userId);
    const received = Number(session.receivedSize);
    const total = Number(session.totalSize);
    const offset = Number(offsetParam);
    if (offsetParam === null || !Number.isSafeInteger(offset) || offset !== received) {
      throw new UploadError(409, "Upload position mismatch", received);
    }

    const declared = contentLength === null ? null : Number(contentLength);
    const max = Math.min(FILE_CHUNK_SIZE, total - received);
    if (declared !== null && (!Number.isSafeInteger(declared) || declared > max)) {
      throw new UploadError(413, "Chunk is too large", received);
    }
    if (!body || declared === 0 || max === 0) throw new UploadError(400, "Empty chunk", received);
    if (quotaUsed(userId) + (declared ?? max) > FILE_BYTES_PER_HOUR) {
      throw new UploadError(429, MEDIA_ERRORS.hourlyQuota, received);
    }

    let written = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.length;
        if (written > max) callback(new UploadError(413, "Chunk is too large", received));
        else callback(null, chunk);
      },
    });
    const file = absolutePath(session.tempPath);
    try {
      await pipeline(
        Readable.fromWeb(body as import("node:stream/web").ReadableStream),
        counter,
        createWriteStream(file, { flags: "r+", start: offset }),
      );
    } catch (error) {
      if (error instanceof UploadError) throw error;
      // Connection dropped mid-chunk: nothing is committed; the client resumes
      // from the unchanged receivedSize.
      throw new UploadError(400, "Chunk upload was interrupted", received);
    }
    if (written === 0) throw new UploadError(400, "Empty chunk", received);
    if (declared !== null && written !== declared) throw new UploadError(400, "Chunk upload was interrupted", received);

    const next = offset + written;
    await truncate(file, next);
    await db.uploadSession.update({ where: { id: sessionId }, data: { receivedSize: BigInt(next) } });
    addQuota(userId, written);
    return { receivedSize: next };
  });
}

export async function sessionStatus(userId: string, sessionId: string) {
  const session = await ownSession(sessionId, userId);
  return { receivedSize: Number(session.receivedSize), totalSize: Number(session.totalSize) };
}

// ---- Complete / cancel ----

export async function completeSession(userId: string, sessionId: string): Promise<ChatMedia> {
  return withLock(sessionId, async () => {
    const session = await ownSession(sessionId, userId);
    const temp = absolutePath(session.tempPath);
    const size = (await stat(temp).catch(() => null))?.size ?? -1;
    if (session.receivedSize !== session.totalSize || size !== Number(session.totalSize)) {
      throw new UploadError(409, "The upload isn't finished yet", Number(session.receivedSize));
    }

    // Real type from the bytes when recognizable; else what the browser said.
    const detected = await fileTypeFromFile(temp).catch(() => undefined);
    const mime = detected?.mime ?? (session.mime || "application/octet-stream");

    const id = crypto.randomUUID();
    const final = await newBareFilePath(id);
    await rename(temp, final.absolute);
    const thumb = await fileThumbnail(final.absolute, size, mime, id);
    try {
      const [upload] = await db.$transaction([
        db.upload.create({
          data: {
            id,
            ownerId: userId,
            kind: "FILE",
            path: final.relative,
            thumbPath: thumb?.thumbPath ?? null,
            originalName: session.originalName,
            mime,
            size: session.totalSize,
            width: thumb?.width ?? null,
            height: thumb?.height ?? null,
            placeholder: thumb?.placeholder ?? null,
          },
          select: chatMediaSelect,
        }),
        db.uploadSession.delete({ where: { id: sessionId } }),
      ]);
      return toChatMedia(upload);
    } catch (error) {
      await removeFiles(final.relative, thumb?.thumbPath);
      throw error;
    }
  });
}

export async function cancelSession(userId: string, sessionId: string) {
  return withLock(sessionId, async () => {
    const session = await ownSession(sessionId, userId);
    await rm(absolutePath(session.tempPath), { force: true });
    await db.uploadSession.delete({ where: { id: sessionId } }).catch(() => {});
  });
}
