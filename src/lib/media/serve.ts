import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

// Streams a file from disk with HTTP Range support (206 / 416), which video
// and audio seeking need (iOS Safari refuses media without it).
export async function serveFile(request: Request, absolute: string, mime: string, etag: string) {
  let size: number;
  try {
    size = (await stat(absolute)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const range = request.headers.get("range");
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    let start = match?.[1] ? Number(match[1]) : NaN;
    let end = match?.[2] ? Number(match[2]) : NaN;
    if (match && !match[1] && match[2]) {
      // Suffix range: the last N bytes.
      start = Math.max(0, size - Number(match[2]));
      end = size - 1;
    } else if (match && match[1] && !match[2]) {
      end = size - 1;
    }
    if (!match || Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    end = Math.min(end, size - 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(absolute, { start, end })) as ReadableStream;
    return new Response(request.method === "HEAD" ? null : stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(request.method === "HEAD" ? null : stream, { status: 200, headers });
}
