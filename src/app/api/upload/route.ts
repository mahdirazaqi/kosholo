import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import busboy from "busboy";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEDIA_ERRORS, PROFILE_PHOTO_MAX_BYTES, UPLOAD_LIMITS, UPLOAD_RATE } from "@/lib/media/limits";
import {
  MediaError,
  processAvatar,
  processProfilePhoto,
  processImage,
  processVideo,
  processVoice,
  type ProcessedUpload,
} from "@/lib/media/process";
import { chatMediaSelect, toChatMedia } from "@/lib/media/serialize";
import { removeFiles, tempFilePath } from "@/lib/media/storage";
import { isRateLimited, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import type { UploadKind } from "@/lib/types/chat";
import { logger } from "@/lib/logger";

// POST /api/upload?kind=IMAGE|VIDEO|VOICE|AVATAR (multipart: file, kind, waveform?)
// A Route Handler (not a Server Action) for large bodies and upload progress.
// Excluded from the proxy, so auth happens here. The body is streamed to a temp
// file with busboy (never buffered), and the size limit is enforced while
// streaming. FILE uploads use the resumable /api/upload/files instead.

const KINDS: UploadKind[] = ["IMAGE", "VIDEO", "VOICE", "AVATAR"];
const MULTIPART_OVERHEAD = 1024 * 1024;

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in first");

  // The kind is in the query too, so oversized bodies are rejected before reading them.
  const kind = new URL(request.url).searchParams.get("kind") as UploadKind | null;
  if (!kind || !KINDS.includes(kind)) return fail(400, MEDIA_ERRORS.unsupported);
  // AVATAR + profile=1: a profile photo (three sizes, up to 10MB, for the gallery).
  const profile = kind === "AVATAR" && new URL(request.url).searchParams.get("profile") === "1";
  const limit = profile ? PROFILE_PHOTO_MAX_BYTES : UPLOAD_LIMITS[kind];
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit + MULTIPART_OVERHEAD) return fail(413, MEDIA_ERRORS.tooLarge(kind));

  const limitKey = `upload:${user.id}`;
  if (isRateLimited(limitKey, UPLOAD_RATE)) return fail(429, RATE_LIMIT_ERROR);
  recordHit(limitKey, UPLOAD_RATE);

  const tmp = await tempFilePath();
  const id = randomUUID();
  let processed: ProcessedUpload | null = null;
  try {
    const received = await receive(request, tmp, limit);
    if (received === "tooLarge") return fail(413, MEDIA_ERRORS.tooLarge(kind));
    if (received === "invalid" || received.size === 0) return fail(400, MEDIA_ERRORS.empty);
    const { fields } = received;
    if (fields.has("kind") && fields.get("kind") !== kind) return fail(400, MEDIA_ERRORS.unsupported);

    processed =
      kind === "IMAGE"
        ? await processImage(tmp, id)
        : kind === "VIDEO"
          ? await processVideo(tmp, id)
          : kind === "VOICE"
            ? await processVoice(tmp, id, fields.get("waveform") ?? null)
            : profile
              ? await processProfilePhoto(tmp, id)
              : await processAvatar(tmp, id);

    const upload = await db.upload.create({
      data: { id, ownerId: user.id, kind, ...processed, waveform: processed.waveform ?? undefined },
      select: chatMediaSelect,
    });
    return Response.json({ ok: true, media: toChatMedia(upload) }, { status: 201 });
  } catch (error) {
    if (processed) await removeFiles(processed.path, processed.thumbPath, processed.mediumPath);
    if (error instanceof MediaError) return fail(422, error.message);
    logger.error("upload", "failed", error);
    return fail(500, MEDIA_ERRORS.processing);
  } finally {
    await rm(tmp, { force: true });
  }
}

const MAX_FIELD_BYTES = 64 * 1024; // waveform JSON and the kind

// Streams the multipart body: the one "file" part goes straight to `tmp`
// (stopping at `limit` bytes), the small text fields are collected.
function receive(
  request: Request,
  tmp: string,
  limit: number,
): Promise<{ size: number; fields: Map<string, string> } | "tooLarge" | "invalid"> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get("content-type");
    if (!request.body || !contentType?.startsWith("multipart/form-data")) return resolve("invalid");

    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: { "content-type": contentType },
        limits: { files: 1, fileSize: limit, fields: 5, fieldSize: MAX_FIELD_BYTES },
      });
    } catch {
      return resolve("invalid");
    }

    const fields = new Map<string, string>();
    let written: Promise<number> | null = null;
    let tooLarge = false;

    parser.on("field", (name, value) => fields.set(name, value));
    parser.on("file", (name, stream) => {
      if (name !== "file" || written) {
        stream.resume(); // ignore anything but the first "file" part
        return;
      }
      let size = 0;
      const out = createWriteStream(tmp);
      written = new Promise<number>((done, failed) => {
        out.on("finish", () => done(size));
        out.on("error", failed);
      });
      written.catch(() => {}); // awaited (or abandoned when too large) in "close"
      stream.on("data", (chunk: Buffer) => (size += chunk.length));
      stream.on("limit", () => {
        // Over the limit: stop writing, drain the rest so the request ends.
        tooLarge = true;
        stream.unpipe(out);
        out.destroy();
        stream.resume();
      });
      stream.pipe(out);
    });
    parser.on("error", () => resolve("invalid"));
    parser.on("close", () => {
      if (tooLarge) return resolve("tooLarge");
      if (!written) return resolve("invalid");
      written.then((size) => resolve(tooLarge ? "tooLarge" : { size, fields }), reject);
    });

    Readable.fromWeb(request.body as import("node:stream/web").ReadableStream)
      .on("error", () => resolve("invalid"))
      .pipe(parser);
  });
}
