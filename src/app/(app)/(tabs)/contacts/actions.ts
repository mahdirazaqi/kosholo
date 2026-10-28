"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { directKeyFor } from "@/lib/chat/conversations";
import { getContacts } from "@/lib/contacts";
import { db } from "@/lib/db";
import { isRateLimited, LIMITS, RATE_LIMIT_ERROR, recordHit } from "@/lib/rate-limit";
import { publicUserSelect, type PublicUser } from "@/lib/users";
import { userIdSchema, userLookupSchema } from "@/lib/validations/contacts";

const NOT_FOUND = "No user found with those details";
const SELF_ERROR = "You can't add yourself";

export type LookupResult =
  | { ok: true; user: PublicUser & { isContact: boolean; isSelf: boolean } }
  | { ok: false; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

// Exact match on username or email only; never partial, so users can't be enumerated.
export async function findUser(query: string): Promise<LookupResult> {
  const me = await requireUser();

  const limitKey = `lookup:${me.id}`;
  if (isRateLimited(limitKey, LIMITS.userLookups)) {
    return { ok: false, error: RATE_LIMIT_ERROR };
  }
  recordHit(limitKey, LIMITS.userLookups);

  const parsed = userLookupSchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const user = await db.user.findUnique({
    where: value.includes("@") ? { email: value } : { username: value },
    select: publicUserSelect,
  });
  if (!user) return { ok: false, error: NOT_FOUND };

  const isSelf = user.id === me.id;
  const isContact =
    !isSelf &&
    (await db.contact.count({ where: { ownerId: me.id, contactId: user.id } })) > 0;

  return { ok: true, user: { ...user, isContact, isSelf } };
}

export async function addContact(userId: string): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  if (parsed.data === me.id) return { ok: false, error: SELF_ERROR };

  const exists = await db.user.count({ where: { id: parsed.data } });
  if (!exists) return { ok: false, error: NOT_FOUND };

  // Adding an existing contact is a no-op.
  await db.contact.createMany({
    data: { ownerId: me.id, contactId: parsed.data },
    skipDuplicates: true,
  });

  revalidatePath("/contacts");
  return { ok: true };
}

export async function removeContact(userId: string): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };

  await db.contact.deleteMany({ where: { ownerId: me.id, contactId: parsed.data } });

  revalidatePath("/contacts");
  return { ok: true };
}

// Get-or-create the single DIRECT conversation with another user, then open it.
// Works whether or not they are in my contacts.
export async function startDirectConversation(otherUserId: string): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = userIdSchema.safeParse(otherUserId);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  const otherId = parsed.data;
  if (otherId === me.id) return { ok: false, error: "You can't start a chat with yourself" };

  const exists = await db.user.count({ where: { id: otherId } });
  if (!exists) return { ok: false, error: NOT_FOUND };

  const directKey = directKeyFor(me.id, otherId);
  let conversationId: string;
  try {
    conversationId = await db.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { directKey },
        create: { type: "DIRECT", directKey, createdById: me.id },
        update: {},
        select: { id: true },
      });
      await tx.conversationMember.createMany({
        data: [
          { conversationId: conversation.id, userId: me.id, role: "MEMBER" },
          { conversationId: conversation.id, userId: otherId, role: "MEMBER" },
        ],
        skipDuplicates: true,
      });
      return conversation.id;
    });
  } catch (error) {
    // A concurrent request created it first; its transaction also added the members.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
    const existing = await db.conversation.findUniqueOrThrow({
      where: { directKey },
      select: { id: true },
    });
    conversationId = existing.id;
  }

  redirect(`/chats/${conversationId}`);
}

// My contacts (public shape), for pickers opened outside the contacts page.
export async function listMyContacts(): Promise<PublicUser[]> {
  const me = await requireUser();
  return getContacts(me.id);
}
