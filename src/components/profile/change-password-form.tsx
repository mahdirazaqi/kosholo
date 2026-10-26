"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/(auth)/actions";
import { FormField, fieldA11y } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { useFormFeedback } from "@/hooks/use-form-feedback";
import { changePasswordSchema } from "@/lib/validations/auth";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, {});
  const { errors, onSubmit } = useFormFeedback(changePasswordSchema, state);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField id="currentPassword" label="رمز عبور فعلی" error={errors.currentPassword}>
        <PasswordInput
          {...fieldA11y("currentPassword", errors.currentPassword)}
          name="currentPassword"
          className="h-11"
          autoComplete="current-password"
        />
      </FormField>
      <FormField id="newPassword" label="رمز عبور جدید" error={errors.newPassword}>
        <PasswordInput
          {...fieldA11y("newPassword", errors.newPassword)}
          name="newPassword"
          className="h-11"
          autoComplete="new-password"
        />
      </FormField>
      <FormField id="confirmPassword" label="تکرار رمز عبور جدید" error={errors.confirmPassword}>
        <PasswordInput
          {...fieldA11y("confirmPassword", errors.confirmPassword)}
          name="confirmPassword"
          className="h-11"
          autoComplete="new-password"
        />
      </FormField>
      <SubmitButton pending={pending}>تغییر رمز عبور</SubmitButton>
    </form>
  );
}
