import type { ComponentPropsWithoutRef } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { FormFieldError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import "./ride-schedule-field.css";

export function RideScheduleField({ name, type, label, fields, prefix, hint, ...input }: {
  name: "pickupDate" | "pickupTime" | "returnDate" | "returnTime";
  type: "date" | "time";
  label: string;
  fields: FormFieldErrors;
  prefix: string;
  hint?: string;
} & Pick<ComponentPropsWithoutRef<"input">, "min" | "max" | "value" | "defaultValue" | "onChange">) {
  const Icon = type === "date" ? CalendarDays : Clock3;
  return <div className="ride-schedule-field">
    <label>
      {label}
      <span className="ride-schedule-control">
        <Icon size={17} aria-hidden="true" />
        <input name={name} type={type} required {...input} {...formFieldProps(fields, name, prefix)} />
      </span>
    </label>
    {hint && <small>{hint}</small>}
    <FormFieldError errors={fields} field={name} prefix={prefix} />
  </div>;
}
