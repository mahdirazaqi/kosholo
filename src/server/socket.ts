import type { Server } from "socket.io";

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    socket.on("ping", (ack?: (response: string) => void) => {
      ack?.("pong");
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected ${socket.id} (${reason})`);
    });
  });
}
