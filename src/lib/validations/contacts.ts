import { z } from "zod";
import { emailSchema, usernameSchema } from "@/lib/validations/auth";

const INVALID_LOOKUP = "Invalid username or email";

// Accepts "username", "@username" or an email; normalizes to the stored form.
// Only exact matches are looked up, so this only checks the format.
export const userLookupSchema = z
  .string({ error: "Enter a username or email" })
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(z.string().min(1, "Enter a username or email"))
  .refine(
    (value) =>
      (value.includes("@") ? emailSchema : usernameSchema).safeParse(value).success,
    INVALID_LOOKUP,
  );

export const userIdSchema = z.uuid({ error: "Invalid user" });
