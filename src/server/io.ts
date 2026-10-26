import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/lib/realtime/events";

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// The custom server and the Next.js bundles (route handlers, Server Actions)
// run in the same process but load separate module instances, so the io
// instance is shared through globalThis rather than a module variable.
const globalForIO = globalThis as unknown as { __io?: AppServer };

export function setIO(io: AppServer) {
  globalForIO.__io = io;
}

export function getIO(): AppServer {
  if (!globalForIO.__io) {
    throw new Error("Socket.IO server has not been initialized");
  }
  return globalForIO.__io;
}

// For emitting from Server Actions: a no-op when no socket server is running
// (e.g. during `next build`), so mutations never fail because of realtime.
export function tryGetIO(): AppServer | undefined {
  return globalForIO.__io;
}
