import { z } from "zod";

// Shared by client forms (instant feedback) and Server Actions (source of truth).

export const emailSchema = z
  .string({ error: "Enter your email" })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .pipe(z.email({ error: "Enter a valid email" }));

export const usernameSchema = z
  .string({ error: "Enter a username" })
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username can be at most 20 characters")
  .regex(/^[a-z0-9_]+$/, "Only letters, numbers and underscores (_) are allowed")
  .regex(/^[a-z]/, "Username must start with a letter");

const name = z
  .string({ error: "Enter your name" })
  .trim()
  .min(1, "Enter your name")
  .max(40, "Name can be at most 40 characters");

// bcrypt only uses the first 72 bytes, so cap by UTF-8 byte length too.
const password = z
  .string({ error: "Enter your password" })
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password can be at most 72 characters")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password is too long",
  );

export const registerSchema = z.object({
  name,
  username: usernameSchema,
  email: emailSchema,
  password,
});

export const loginSchema = z.object({
  identifier: z
    .string({ error: "Enter your email or username" })
    .trim()
    .toLowerCase()
    .min(1, "Enter your email or username"),
  password: z.string({ error: "Enter your password" }).min(1, "Enter your password"),
});

export const updateProfileSchema = z.object({ name });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password" })
      .min(1, "Enter your current password"),
    newPassword: password,
    confirmPassword: z.string({ error: "Confirm your new password" }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords don't match",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
