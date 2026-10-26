"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as groups from "@/lib/chat/groups";
import { GroupError, type Actor } from "@/lib/chat/groups";
import { emitRemoved, emitToMembers } from "@/lib/realtime/emit";
import { invalidateMembership } from "@/lib/realtime/membership";
import type { ChatMessage } from "@/lib/types/chat";
import { userIdSchema } from "@/lib/validations/contacts";
import {
  addMembersSchema,
  createGroupSchema,
  groupTitleSchema,
  memberRoleSchema,
} from "@/lib/validations/groups";

// Every action: requireUser → validate → transactional change with permission
// checks (lib/chat/groups.ts) → realtime events. Nothing here trusts the client.

export type GroupActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const GENERIC_ERROR = "خطایی رخ داد، لطفاً دوباره تلاش کنید";

async function currentActor(): Promise<Actor> {
  const user = await requireUser();
  return { id: user.id, name: user.name };
}

async function run<T extends object>(work: () => Promise<T>): Promise<GroupActionResult<T>> {
  try {
    const result = await work();
    revalidatePath("/");
    return { ok: true, ...result };
  } catch (error) {
    unstable_rethrow(error); // redirects from requireUser() etc.
    if (error instanceof GroupError) return { ok: false, error: error.message };
    console.error("[group-action]", error);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// System messages travel the normal message:new path (every member's user
// room), so chat lists and open chats update without special handling.
async function broadcast(conversationId: string, messages: (ChatMessage | null)[]) {
  for (const message of messages) {
    if (message) await emitToMembers(conversationId, "message:new", { message, tempId: null });
  }
}

async function broadcastMembers(conversationId: string) {
  const members = await groups.getMembers(conversationId);
  await emitToMembers(conversationId, "conversation:updated", { conversationId, members });
}

function parseId(value: unknown) {
  const parsed = userIdSchema.safeParse(value);
  if (!parsed.success) throw new GroupError("درخواست نامعتبر است");
  return parsed.data;
}

export async function createGroup(input: { title: string; memberIds: string[] }) {
  return run(async () => {
    const actor = await currentActor();
    const parsed = createGroupSchema.safeParse(input);
    if (!parsed.success) throw new GroupError(parsed.error.issues[0].message);
    const { conversationId, message } = await groups.createGroup(actor, parsed.data.title, parsed.data.memberIds);
    // New members' clients see an unknown conversation in message:new and
    // fetch the row, so the group appears in their lists instantly.
    await broadcast(conversationId, [message]);
    return { conversationId };
  });
}

export async function renameGroup(conversationId: string, title: string) {
  return run(async () => {
    const actor = await currentActor();
    const parsed = groupTitleSchema.safeParse(title);
    if (!parsed.success) throw new GroupError(parsed.error.issues[0].message);
    const id = parseId(conversationId);
    const { message } = await groups.renameGroup(actor, id, parsed.data);
    if (message) {
      await broadcast(id, [message]);
      await emitToMembers(id, "conversation:updated", { conversationId: id, title: parsed.data });
    }
    return {};
  });
}

export async function addMembers(conversationId: string, userIds: string[]) {
  return run(async () => {
    const actor = await currentActor();
    const parsed = addMembersSchema.safeParse(userIds);
    if (!parsed.success) throw new GroupError(parsed.error.issues[0].message);
    const id = parseId(conversationId);
    const { message } = await groups.addMembers(actor, id, parsed.data);
    invalidateMembership(id); // so the new members are included below
    await broadcast(id, [message]);
    await broadcastMembers(id);
    return {};
  });
}

export async function removeMember(conversationId: string, userId: string) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const targetId = parseId(userId);
    const { message } = await groups.removeMember(actor, id, targetId);
    emitRemoved(id, [targetId], "removed"); // also invalidates the membership cache
    await broadcast(id, [message]);
    await broadcastMembers(id);
    return {};
  });
}

export async function leaveGroup(conversationId: string) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const result = await groups.leaveGroup(actor, id);
    emitRemoved(id, [actor.id], "left");
    if (!result.deleted) {
      await broadcast(id, result.messages);
      await broadcastMembers(id);
    }
    return {};
  });
}

export async function setMemberRole(conversationId: string, userId: string, role: "ADMIN" | "MEMBER") {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const targetId = parseId(userId);
    const parsedRole = memberRoleSchema.safeParse(role);
    if (!parsedRole.success) throw new GroupError("درخواست نامعتبر است");
    const { message } = await groups.setMemberRole(actor, id, targetId, parsedRole.data);
    if (message) {
      await broadcast(id, [message]);
      await broadcastMembers(id);
    }
    return {};
  });
}

export async function deleteGroup(conversationId: string) {
  return run(async () => {
    const actor = await currentActor();
    const id = parseId(conversationId);
    const { memberIds } = await groups.deleteGroup(actor, id);
    emitRemoved(id, memberIds, "deleted");
    return {};
  });
}
