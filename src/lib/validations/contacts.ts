import { z } from "zod";
import { emailSchema, usernameSchema } from "@/lib/validations/auth";

const INVALID_LOOKUP = "نام کاربری یا ایمیل معتبر نیست";

// Accepts "username", "@username" or an email; normalizes to the stored form.
// Only exact matches are looked up, so this only checks the format.
export const userLookupSchema = z
  .string({ error: "نام کاربری یا ایمیل را وارد کنید" })
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(z.string().min(1, "نام کاربری یا ایمیل را وارد کنید"))
  .refine(
    (value) =>
      (value.includes("@") ? emailSchema : usernameSchema).safeParse(value).success,
    INVALID_LOOKUP,
  );

export const userIdSchema = z.uuid({ error: "کاربر نامعتبر است" });
