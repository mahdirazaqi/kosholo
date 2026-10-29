"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/app/(auth)/actions";
import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsSection } from "@/components/settings/settings-section";
import { FieldRow } from "@/components/settings/settings-row";
import { useFormFeedback } from "@/hooks/use-form-feedback";
import { guardOnline } from "@/lib/client-utils";
import { changePasswordSchema } from "@/lib/validations/auth";

// Current / new / repeat as inset fields; "Save" in the top bar submits the form.
// Online only.
export function PasswordSettings() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changePassword, {});
  const { errors, onSubmit } = useFormFeedback(changePasswordSchema, state);

  useEffect(() => {
    if (state.ok) router.back();
  }, [state, router]);

  const firstError = errors.currentPassword ?? errors.newPassword ?? errors.confirmPassword;
  const field = { dir: "ltr" as const, type: "password" as const, required: true };

  return (
    <SettingsPage
      title="Change Password"
      backLabel="Back"
      backHref="/settings/privacy"
      largeTitle={false}
      end={
        <button
          type="submit"
          form="password-form"
          disabled={pending}
          className="flex min-h-11 items-center px-3 text-[17px] font-semibold text-link disabled:opacity-50"
        >
          Save
        </button>
      }
    >
      <form
        id="password-form"
        action={formAction}
        noValidate
        onSubmit={(event) => {
          if (!guardOnline()) return event.preventDefault();
          onSubmit(event);
        }}
      >
        <SettingsSection
          footer={firstError ?? "The new password must be at least 8 characters."}
          footerTone={firstError ? "error" : "muted"}
        >
          <FieldRow {...field} id="current-password" name="currentPassword" label="Current" placeholder="Required" autoComplete="current-password" error={!!errors.currentPassword} />
          <FieldRow {...field} id="new-password" name="newPassword" label="New" placeholder="Required" autoComplete="new-password" error={!!errors.newPassword} />
          <FieldRow {...field} id="confirm-password" name="confirmPassword" label="Repeat" placeholder="Required" autoComplete="new-password" error={!!errors.confirmPassword} />
        </SettingsSection>
      </form>
    </SettingsPage>
  );
}
