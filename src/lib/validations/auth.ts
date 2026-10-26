import { z } from "zod";

// Shared by client forms (instant feedback) and Server Actions (source of truth).

const email = z
  .string({ error: "ایمیل را وارد کنید" })
  .trim()
  .toLowerCase()
  .min(1, "ایمیل را وارد کنید")
  .pipe(z.email({ error: "ایمیل معتبر نیست" }));

const username = z
  .string({ error: "نام کاربری را وارد کنید" })
  .trim()
  .toLowerCase()
  .min(3, "نام کاربری باید حداقل ۳ کاراکتر باشد")
  .max(20, "نام کاربری حداکثر می‌تواند ۲۰ کاراکتر باشد")
  .regex(/^[a-z0-9_]+$/, "فقط حروف انگلیسی، عدد و زیرخط (_) مجاز است")
  .regex(/^[a-z]/, "نام کاربری باید با یک حرف انگلیسی شروع شود");

const name = z
  .string({ error: "نام را وارد کنید" })
  .trim()
  .min(1, "نام را وارد کنید")
  .max(40, "نام حداکثر می‌تواند ۴۰ کاراکتر باشد");

// bcrypt only uses the first 72 bytes, so cap by UTF-8 byte length too.
const password = z
  .string({ error: "رمز عبور را وارد کنید" })
  .min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد")
  .max(72, "رمز عبور حداکثر می‌تواند ۷۲ کاراکتر باشد")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "رمز عبور بیش از حد طولانی است",
  );

export const registerSchema = z.object({ name, username, email, password });

export const loginSchema = z.object({
  identifier: z
    .string({ error: "ایمیل یا نام کاربری را وارد کنید" })
    .trim()
    .toLowerCase()
    .min(1, "ایمیل یا نام کاربری را وارد کنید"),
  password: z.string({ error: "رمز عبور را وارد کنید" }).min(1, "رمز عبور را وارد کنید"),
});

export const updateProfileSchema = z.object({ name });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "رمز عبور فعلی را وارد کنید" })
      .min(1, "رمز عبور فعلی را وارد کنید"),
    newPassword: password,
    confirmPassword: z.string({ error: "تکرار رمز عبور را وارد کنید" }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    error: "تکرار رمز عبور با رمز جدید یکسان نیست",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
