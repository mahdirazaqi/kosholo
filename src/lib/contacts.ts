import "server-only";

import { db } from "@/lib/db";
import { publicUserSelect, type PublicUser } from "@/lib/users";

export async function getContacts(userId: string): Promise<PublicUser[]> {
  const rows = await db.contact.findMany({
    where: { ownerId: userId },
    select: { contact: { select: publicUserSelect } },
  });
  return rows
    .map((row) => row.contact)
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));
}
