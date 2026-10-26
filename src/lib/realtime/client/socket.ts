"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/realtime/events";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | undefined;

// Single shared connection to the custom server (same origin; the session
// cookie authenticates the handshake). Created lazily because io() needs
// `window.location`. WebSocket first, long-polling as a fallback; default
// auto-reconnect.
export function getSocket(): AppSocket {
  socket ??= io({
    path: "/socket.io",
    autoConnect: false,
    transports: ["websocket", "polling"],
    tryAllTransports: true,
  });
  return socket;
}
