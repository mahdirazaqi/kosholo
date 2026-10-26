import { z } from "zod";
import { toFaDigits } from "@/lib/digits";

export const MAX_GROUP_MEMBERS = 50;

export const groupTitleSchema = z
  .string({ error: "نام گروه را وارد کنید" })
  .trim()
  .min(1, "نام گروه را وارد کنید")
  .max(50, "نام گروه حداکثر می‌تواند ۵۰ کاراکتر باشد");

const memberIdsSchema = z
  .array(z.uuid({ error: "کاربر نامعتبر است" }), { error: "اعضا را انتخاب کنید" })
  .min(1, "حداقل یک عضو انتخاب کنید")
  .max(MAX_GROUP_MEMBERS - 1, `گروه حداکثر ${toFaDigits(MAX_GROUP_MEMBERS)} عضو دارد`)
  .transform((ids) => [...new Set(ids)]);

export const createGroupSchema = z.object({ title: groupTitleSchema, memberIds: memberIdsSchema });
export const addMembersSchema = memberIdsSchema;
export const memberRoleSchema = z.enum(["ADMIN", "MEMBER"]);
