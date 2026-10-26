import type { z } from "zod";

// Shape returned by form Server Actions and consumed by useActionState.
export type FormState<Field extends string = string> = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<Field, string>>;
  // Echoed non-secret values so the form keeps its input after a failed submit.
  values?: Partial<Record<Field, string>>;
};

// First error message per field.
export function fieldErrors<Field extends string>(
  error: z.ZodError,
): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as Field | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function formValues<Field extends string>(
  formData: FormData,
  fields: readonly Field[],
): Partial<Record<Field, string>> {
  const values: Partial<Record<Field, string>> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}
