import "./form-field-errors.css";

export type FormFieldErrors = Record<string, string>;

export function formFieldProps(errors: FormFieldErrors, field: string, prefix: string) {
  return errors[field] ? { "aria-invalid": true as const, "aria-describedby": `${prefix}-${field}-error` } : {};
}

export function FormFieldError({ errors, field, prefix }: { errors: FormFieldErrors; field: string; prefix: string }) {
  if (!errors[field]) return null;
  return <small className="form-field-error" id={`${prefix}-${field}-error`}>{errors[field]}</small>;
}

export function focusFirstFormError(form: HTMLFormElement, errors: FormFieldErrors) {
  requestAnimationFrame(() => {
    const field = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]),select,textarea',
    )).find(control => Boolean(errors[control.dataset.errorField ?? control.name]));
    const disclosure = field?.closest("details");
    if (disclosure) disclosure.open = true;
    field?.focus();
  });
}
