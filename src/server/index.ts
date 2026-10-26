import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./io";
import { registerSocketHandlers } from "./socket";

const dev = process.env.NODE_ENV !== "production";
loadEnvConfig(process.cwd(), dev);

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
  const httpServer = createServer();
  const app = next({ dev, hostname, port, httpServer });
  const handle = app.getRequestHandler();

  await app.prepare();

  httpServer.on("request", (req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, { path: "/socket.io" });
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
