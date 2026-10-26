"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { fieldErrors, type FormState } from "@/lib/form";

// Client-side half of form handling:
// - validates with the shared zod schema before submitting (instant errors),
// - toasts the action's message whenever a new state arrives,
// - merges client and server field errors.
export function useFormFeedback<Field extends string>(
  schema: z.ZodType,
  state: FormState<Field>,
) {
  const [clientErrors, setClientErrors] = useState<Partial<Record<Field, string>>>({});

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const result = schema.safeParse(data);
    if (result.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(fieldErrors<Field>(result.error));
  }

  const errors: Partial<Record<Field, string>> = { ...state.errors, ...clientErrors };
  return { errors, onSubmit };
}
