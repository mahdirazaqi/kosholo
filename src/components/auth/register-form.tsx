"use client";

import { useActionState } from "react";
import { register } from "@/app/(auth)/actions";
import { FormField, fieldA11y } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { useFormFeedback } from "@/hooks/use-form-feedback";
import { registerSchema } from "@/lib/validations/auth";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, {});
  const { errors, onSubmit } = useFormFeedback(registerSchema, state);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField id="name" label="Name" error={errors.name}>
        <Input
          {...fieldA11y("name", errors.name)}
          name="name"
          className="h-11"
          autoComplete="name"
          maxLength={40}
          defaultValue={state.values?.name}
        />
      </FormField>

      <FormField id="username" label="Username" error={errors.username}>
        <Input
          {...fieldA11y("username", errors.username)}
          name="username"
          dir="ltr"
          className="h-11 text-start"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          defaultValue={state.values?.username}
        />
      </FormField>

      <FormField id="email" label="Email" error={errors.email}>
        <Input
          {...fieldA11y("email", errors.email)}
          name="email"
          type="email"
          dir="ltr"
          className="h-11 text-start"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.email}
        />
      </FormField>

      <FormField id="password" label="Password" error={errors.password}>
        <PasswordInput
          {...fieldA11y("password", errors.password)}
          name="password"
          className="h-11"
          autoComplete="new-password"
        />
      </FormField>

      <FormMessage message={state.message} />

      <SubmitButton pending={pending}>Sign up</SubmitButton>
    </form>
  );
}
