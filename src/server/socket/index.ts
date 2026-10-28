import { getMembership, isConversationMember, isUuid } from "@/lib/realtime/membership";
import {
  conversationRoom,
  presenceRoom,
  TYPING_SERVER_MIN_INTERVAL_MS,
  userRoom,
} from "@/lib/realtime/events";
import type { AppServer } from "@/server/io";
import { registerAuth } from "@/server/socket/auth";
import { getWatchablePresence, userConnected, userDisconnected } from "@/server/socket/presence";

export function registerSocketHandlers(io: AppServer) {
  registerAuth(io);

  io.on("connection", (socket) => {
    const { userId, name } = socket.data;
    socket.join(userRoom(userId));
    userConnected(io, userId);
    socket.emit("session:ready", { userId });

    // ---- Conversation rooms (chat page open) ----
    socket.on("conversation:join", async (conversationId, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (!isUuid(conversationId)) return reply({ ok: false, error: "invalid" });
      if (!(await isConversationMember(conversationId, userId))) {
        return reply({ ok: false, error: "forbidden" });
      }
      await socket.join(conversationRoom(conversationId));
      reply({ ok: true });
    });

    socket.on("conversation:leave", (conversationId) => {
      if (isUuid(conversationId)) void socket.leave(conversationRoom(conversationId));
    });

    // ---- Typing ----
    // Delivered to the other members' user rooms (not only conv:{id}) so the
    // chat list can show it too. A socket's typing:start is accepted at most
    // once per second; typing:stop only after an accepted start.
    const typingIn = new Map<string, number>(); // conversationId → last accepted start
    const typingPayload = (conversationId: string) => ({ conversationId, userId, name });

    // Null = not allowed to type here. Channels: only admins type, and only
    // other admins see it (subscribers never learn who is in the channel).
    async function otherMemberRooms(conversationId: string) {
      const { type, memberIds, adminIds } = await getMembership(conversationId);
      if (!memberIds.includes(userId)) return null;
      if (type === "CHANNEL") {
        if (!adminIds.has(userId)) return null;
        return [...adminIds].filter((id) => id !== userId).map(userRoom);
      }
      return memberIds.filter((id) => id !== userId).map(userRoom);
    }

    socket.on("typing:start", async (conversationId) => {
      if (!isUuid(conversationId)) return;
      const now = Date.now();
      const last = typingIn.get(conversationId);
      if (last !== undefined && now - last < TYPING_SERVER_MIN_INTERVAL_MS) return;
      typingIn.set(conversationId, now);
      const rooms = await otherMemberRooms(conversationId);
      if (!rooms) return typingIn.delete(conversationId);
      if (rooms.length) io.to(rooms).emit("typing:start", typingPayload(conversationId));
    });

    async function stopTyping(conversationId: string) {
      if (!typingIn.delete(conversationId)) return;
      const rooms = await otherMemberRooms(conversationId);
      if (rooms?.length) io.to(rooms).emit("typing:stop", typingPayload(conversationId));
    }

    socket.on("typing:stop", (conversationId) => {
      if (isUuid(conversationId)) void stopTyping(conversationId);
    });

    // ---- Presence ----
    socket.on("presence:subscribe", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const states = await getWatchablePresence(userId, payload?.userIds);
      await Promise.all(states.map((state) => socket.join(presenceRoom(state.userId))));
      reply(states);
    });

    socket.on("presence:unsubscribe", (payload) => {
      if (!Array.isArray(payload?.userIds)) return;
      for (const id of payload.userIds) if (isUuid(id)) void socket.leave(presenceRoom(id));
    });

    socket.on("disconnect", () => {
      for (const conversationId of [...typingIn.keys()]) void stopTyping(conversationId);
      userDisconnected(io, userId);
    });
  });
}
