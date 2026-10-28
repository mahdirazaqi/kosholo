"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fieldErrors, formValues, type FormState } from "@/lib/form";
import {
  isRateLimited,
  LIMITS,
  RATE_LIMIT_ERROR,
  recordHit,
  resetHits,
} from "@/lib/rate-limit";
import { createSession, deleteSession } from "@/lib/session";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "@/lib/validations/auth";
import { logger } from "@/lib/logger";

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS = "Incorrect email/username or password";
const EMAIL_TAKEN = "This email is already registered";
const USERNAME_TAKEN = "This username is already taken";
const GENERIC_ERROR = "Something went wrong, please try again";

// Compared against when the user doesn't exist, so a failed lookup takes as
// long as a wrong password and doesn't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
function getDummyHash() {
  dummyHash ??= bcrypt.hash("kosholo-dummy-password", BCRYPT_COST);
  return dummyHash;
}

// The client IP for rate limiting. In production the app is only reachable
// through Caddy, which sets X-Forwarded-For to the real client address
// (ignoring whatever the client sent); we only trust that first proxy hop,
// i.e. the right-most entry. Without a proxy the custom server fills the
// header from the socket address.
async function getClientIp() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || "unknown";
}

// Only allow same-site relative paths after login.
function safeRedirectPath(from: FormDataEntryValue | null) {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) {
    return "/";
  }
  return from;
}

type RegisterField = "name" | "username" | "email" | "password";

export async function register(
  _prev: FormState<RegisterField>,
  formData: FormData,
): Promise<FormState<RegisterField>> {
  const values = formValues(formData, ["name", "username", "email"] as const);
  const ip = await getClientIp();
  const limitKey = `register:${ip}`;
  if (isRateLimited(limitKey, LIMITS.registrations)) {
    return { message: RATE_LIMIT_ERROR, values };
  }

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values };
  }
  const { name, username, email, password } = parsed.data;

  const errors = await findTakenFields(email, username);
  if (errors) return { errors, values };

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let userId: string;
  try {
    const user = await db.user.create({
      data: { name, username, email, passwordHash },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    // Lost a race with a concurrent signup for the same email/username.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { errors: (await findTakenFields(email, username)) ?? {}, values };
    }
    throw error;
  }

  recordHit(limitKey, LIMITS.registrations);
  await createSession(userId);
  redirect("/");
}

async function findTakenFields(email: string, username: string) {
  const existing = await db.user.findMany({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing.length === 0) return null;

  const errors: FormState<RegisterField>["errors"] = {};
  if (existing.some((user) => user.email === email)) errors.email = EMAIL_TAKEN;
  if (existing.some((user) => user.username === username)) errors.username = USERNAME_TAKEN;
  return errors;
}

type LoginField = "identifier" | "password";

export async function login(
  _prev: FormState<LoginField>,
  formData: FormData,
): Promise<FormState<LoginField>> {
  const values = formValues(formData, ["identifier"] as const);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values };
  }
  const { identifier, password } = parsed.data;

  const ip = await getClientIp();
  const limitKey = `login:${ip}:${identifier}`;
  if (isRateLimited(limitKey, LIMITS.loginFailures)) {
    return { message: RATE_LIMIT_ERROR, values };
  }

  const user = await db.user.findUnique({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
    select: { id: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !valid) {
    recordHit(limitKey, LIMITS.loginFailures);
    return { message: INVALID_CREDENTIALS, values };
  }

  resetHits(limitKey);
  await createSession(user.id);
  redirect(safeRedirectPath(formData.get("from")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

type ProfileField = "name";

export async function updateProfile(
  _prev: FormState<ProfileField>,
  formData: FormData,
): Promise<FormState<ProfileField>> {
  const user = await requireUser();
  const values = formValues(formData, ["name"] as const);
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values };
  }

  try {
    await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  } catch (error) {
    logger.error("updateProfile", "failed", error);
    return { message: GENERIC_ERROR, values };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Your name was updated", values: { name: parsed.data.name } };
}

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

export async function changePassword(
  _prev: FormState<PasswordField>,
  formData: FormData,
): Promise<FormState<PasswordField>> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }
  const { currentPassword, newPassword } = parsed.data;

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !(await bcrypt.compare(currentPassword, record.passwordHash))) {
    return { errors: { currentPassword: "Current password is incorrect" } };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { ok: true, message: "Password changed" };
}
