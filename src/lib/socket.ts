"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | undefined;

// Single shared connection to the custom server (same origin). Created lazily
// because io() needs `window.location`, which doesn't exist during SSR.
export function getSocket(): Socket {
  socket ??= io({ path: "/socket.io", autoConnect: false });
  return socket;
}
