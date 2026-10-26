// Emitting from Server Actions. Delivery is per user (user:{id} rooms) so every
// tab/device of every member gets the event, whether or not the chat is open.
import { getMemberIds } from "@/lib/realtime/membership";
import { userRoom, type ServerToClientEvents } from "@/lib/realtime/events";
import { tryGetIO } from "@/server/io";

export async function emitToMembers<E extends keyof ServerToClientEvents>(
  conversationId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  const io = tryGetIO();
  if (!io) return;
  const memberIds = await getMemberIds(conversationId);
  if (memberIds.length === 0) return;
  io.to(memberIds.map(userRoom)).emit(event, ...args);
}
