import type { AppServer } from "@/server/io";
import { db } from "@/lib/db";
import { readCookie, SESSION_COOKIE, verifySession } from "@/lib/session-token";

// Handshake: the browser sends the httpOnly "session" cookie with the
// polling/websocket request. Unauthenticated connections are rejected.
export function registerAuth(io: AppServer) {
  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.request.headers.cookie, SESSION_COOKIE);
      const session = await verifySession(token);
      if (!session) return next(new Error("unauthorized"));

      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, name: true },
      });
      if (!user) return next(new Error("unauthorized"));

      socket.data.userId = user.id;
      socket.data.name = user.name;
      next();
    } catch (error) {
      console.error("[socket] auth failed", error);
      next(new Error("unauthorized"));
    }
  });
}
