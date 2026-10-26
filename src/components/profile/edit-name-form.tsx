"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(auth)/actions";
import { FormField, fieldA11y } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { useFormFeedback } from "@/hooks/use-form-feedback";
import { updateProfileSchema } from "@/lib/validations/auth";

export function EditNameForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, {});
  const { errors, onSubmit } = useFormFeedback(updateProfileSchema, state);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField id="name" label="نام" error={errors.name}>
        <Input
          {...fieldA11y("name", errors.name)}
          name="name"
          className="h-11"
          autoComplete="name"
          maxLength={40}
          defaultValue={state.values?.name ?? name}
        />
      </FormField>
      <SubmitButton pending={pending}>ذخیره نام</SubmitButton>
    </form>
  );
}
