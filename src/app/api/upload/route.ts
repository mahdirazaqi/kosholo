import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEDIA_ERRORS, UPLOAD_LIMITS, UPLOAD_RATE } from "@/lib/media/limits";
import {
  MediaError,
  processAvatar,
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
// Excluded from the proxy, so auth happens here.

const KINDS: UploadKind[] = ["IMAGE", "VIDEO", "VOICE", "AVATAR"];
const MULTIPART_OVERHEAD = 1024 * 1024;

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in first");

  // The kind is in the query too, so oversized bodies are rejected before reading them.
  const kind = new URL(request.url).searchParams.get("kind") as UploadKind | null;
  if (!kind || !KINDS.includes(kind)) return fail(400, MEDIA_ERRORS.unsupported);
  const limit = UPLOAD_LIMITS[kind];
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit + MULTIPART_OVERHEAD) return fail(413, MEDIA_ERRORS.tooLarge(kind));

  const limitKey = `upload:${user.id}`;
  if (isRateLimited(limitKey, UPLOAD_RATE)) return fail(429, RATE_LIMIT_ERROR);
  recordHit(limitKey, UPLOAD_RATE);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, MEDIA_ERRORS.empty);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, MEDIA_ERRORS.empty);
  if (form.get("kind") !== null && form.get("kind") !== kind) return fail(400, MEDIA_ERRORS.unsupported);
  if (file.size > limit) return fail(413, MEDIA_ERRORS.tooLarge(kind));

  const tmp = await tempFilePath();
  const id = randomUUID();
  let processed: ProcessedUpload | null = null;
  try {
    await pipeline(Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream), createWriteStream(tmp));
    processed =
      kind === "IMAGE"
        ? await processImage(tmp, id)
        : kind === "VIDEO"
          ? await processVideo(tmp, id)
          : kind === "VOICE"
            ? await processVoice(tmp, id, form.get("waveform"))
            : await processAvatar(tmp, id);

    const upload = await db.upload.create({
      data: { id, ownerId: user.id, kind, ...processed, waveform: processed.waveform ?? undefined },
      select: chatMediaSelect,
    });
    return Response.json({ ok: true, media: toChatMedia(upload) }, { status: 201 });
  } catch (error) {
    if (processed) await removeFiles(processed.path, processed.thumbPath);
    if (error instanceof MediaError) return fail(422, error.message);
    logger.error("upload", "failed", error);
    return fail(500, MEDIA_ERRORS.processing);
  } finally {
    await rm(tmp, { force: true });
  }
}
