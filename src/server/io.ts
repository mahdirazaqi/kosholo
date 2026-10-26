import type { Server } from "socket.io";

// The custom server and the Next.js bundles (route handlers, Server Actions)
// run in the same process but load separate module instances, so the io
// instance is shared through globalThis rather than a module variable.
const globalForIO = globalThis as unknown as { __io?: Server };

export function setIO(io: Server) {
  globalForIO.__io = io;
}

export function getIO(): Server {
  if (!globalForIO.__io) {
    throw new Error("Socket.IO server has not been initialized");
  }
  return globalForIO.__io;
}
