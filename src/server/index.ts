// Must stay the first import: loads .env before anything reads process.env.
import "./env";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO, type AppServer } from "./io";
import { registerSocketHandlers } from "./socket";

const dev = process.env.NODE_ENV !== "production";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
  const httpServer = createServer();
  const app = next({ dev, hostname, port, httpServer });
  const handle = app.getRequestHandler();

  await app.prepare();

  httpServer.on("request", (req, res) => {
    // Behind a reverse proxy this header is already set; when exposed
    // directly, fall back to the socket address (used by rate limiting).
    req.headers["x-forwarded-for"] ??= req.socket.remoteAddress;
    handle(req, res);
  });

  const io: AppServer = new Server(httpServer, { path: "/socket.io" });
  setIO(io);
  registerSocketHandlers(io);

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Ready on http://localhost:${port} (${dev ? "development" : "production"})`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
