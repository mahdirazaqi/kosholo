// Must stay the first import: loads and validates env before anything reads it.
import "./env";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkMediaBinaries } from "@/lib/media/ffmpeg";
import { setIO, type AppServer } from "./io";
import { startMediaCleanup } from "./media-cleanup";
import { registerSocketHandlers } from "./socket";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT || "3000", 10);
// HOST, not HOSTNAME: Docker sets HOSTNAME to the container id.
const host = process.env.HOST || "0.0.0.0";
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const httpServer = createServer();
  const app = next({ dev, hostname: host, port, httpServer });
  const handle = app.getRequestHandler();
  await app.prepare();

  httpServer.on("request", (req, res) => {
    // Behind the reverse proxy (Caddy) this header is set by the proxy; when
    // exposed directly, fall back to the socket address (rate limiting).
    req.headers["x-forwarded-for"] ??= req.socket.remoteAddress;
    void handle(req, res);
  });

  const io: AppServer = new Server(httpServer, {
    path: "/socket.io",
    // Same-origin only: no CORS headers, and browser connections from another
    // origin are refused (WebSockets aren't covered by CORS).
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true); // non-browser client; the session cookie still decides
      try {
        callback(null, new URL(origin).host === req.headers.host);
      } catch {
        callback(null, false);
      }
    },
  });
  setIO(io);
  registerSocketHandlers(io);

  const missing = await checkMediaBinaries();
  if (missing.length) {
    logger.error(
      "media",
      `${missing.join(", ")} not found. Video and voice uploads will fail. ` +
        "Install ffmpeg (e.g. `apt install ffmpeg`) or set FFMPEG_PATH / FFPROBE_PATH.",
    );
  }
  const stopCleanup = startMediaCleanup();

  httpServer.listen(port, host, () => {
    logger.info("server", `ready on http://${host}:${port} (${dev ? "development" : "production"})`);
  });

  // Graceful shutdown (docker stop sends SIGTERM): stop accepting connections,
  // close Socket.IO and the HTTP server, disconnect Prisma, exit. Forced after 10s.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server", `${signal} received, shutting down`);
    const force = setTimeout(() => {
      logger.warn("server", "shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    stopCleanup();
    httpServer.closeIdleConnections();
    // io.close() disconnects all sockets and closes the HTTP server it's attached to.
    void io.close(async (error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        logger.error("server", "error while closing the HTTP server", error);
      }
      try {
        await db.$disconnect();
      } catch (dbError) {
        logger.error("server", "error while disconnecting the database", dbError);
      }
      logger.info("server", "shutdown complete");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error("server", "failed to start", error);
  process.exit(1);
});
