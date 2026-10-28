import { z } from "zod";
import { formatCount } from "@/lib/numbers";

export const MAX_GROUP_MEMBERS = 50;

export const groupTitleSchema = z
  .string({ error: "Enter a group name" })
  .trim()
  .min(1, "Enter a group name")
  .max(50, "Group name can be at most 50 characters");

const memberIdsSchema = z
  .array(z.uuid({ error: "Invalid user" }), { error: "Select members" })
  .min(1, "Select at least one member")
  .max(MAX_GROUP_MEMBERS - 1, `A group can have at most ${formatCount(MAX_GROUP_MEMBERS, "member")}`)
  .transform((ids) => [...new Set(ids)]);

export const createGroupSchema = z.object({ title: groupTitleSchema, memberIds: memberIdsSchema });
export const addMembersSchema = memberIdsSchema;
export const memberRoleSchema = z.enum(["ADMIN", "MEMBER"]);
