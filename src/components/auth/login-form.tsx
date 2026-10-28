"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/app/(auth)/actions";
import { FormField, fieldA11y } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { useFormFeedback } from "@/hooks/use-form-feedback";
import { loginSchema } from "@/lib/validations/auth";

export function LoginForm() {
  const from = useSearchParams().get("from") ?? "/";
  const [state, formAction, pending] = useActionState(login, {});
  const { errors, onSubmit } = useFormFeedback(loginSchema, state);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="from" value={from} />

      <FormField id="identifier" label="Email or username" error={errors.identifier}>
        <Input
          {...fieldA11y("identifier", errors.identifier)}
          name="identifier"
          dir="ltr"
          className="h-11 text-start"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={state.values?.identifier}
        />
      </FormField>

      <FormField id="password" label="Password" error={errors.password}>
        <PasswordInput
          {...fieldA11y("password", errors.password)}
          name="password"
          className="h-11"
          autoComplete="current-password"
        />
      </FormField>

      <FormMessage message={state.message} />

      <SubmitButton pending={pending}>Log in</SubmitButton>
    </form>
  );
}
