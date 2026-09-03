"use client";

import { forwardRef, ReactNode, useId } from "react";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, htmlFor, required, error, hint, children, className = "", labelClassName = "" }, ref) => {
    const fieldId = useId();
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

    // If children is an input/select/textarea, inject the necessary props
    const enhancedChildren = typeof children === "object" && children !== null && "props" in children
      ? React.cloneElement(children as React.ReactElement, {
          id: children.props.id || fieldId,
          "aria-describedby": describedBy,
          "aria-invalid": !!error,
          "aria-required": required,
        })
      : children;

    return (
      <div ref={ref} className={`form-field ${className}`}>
        <label htmlFor={htmlFor || fieldId} className={`form-label ${labelClassName}`}>
          {label}
          {required && <span className="required" aria-hidden="true">*</span>}
        </label>
        {enhancedChildren}
        {error && (
          <p id={errorId} className="form-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="form-hint">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = "FormField";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, id, className = "", ...props }, ref) => {
    const fieldId = useId();
    const inputId = id || fieldId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

    if (label) {
      return (
        <FormField label={label} required={required} error={error} hint={hint} htmlFor={inputId}>
          <input
            ref={ref}
            id={inputId}
            className={`form-input ${error ? "error" : ""} ${className}`}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            aria-required={required}
            {...props}
          />
        </FormField>
      );
    }

    return (
      <input
        ref={ref}
        id={inputId}
        className={`form-input ${error ? "error" : ""} ${className}`}
        aria-describedby={describedBy}
        aria-invalid={!!error}
        aria-required={required}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, id, className = "", ...props }, ref) => {
    const fieldId = useId();
    const textareaId = id || fieldId;
    const errorId = `${textareaId}-error`;
    const hintId = `${textareaId}-hint`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

    if (label) {
      return (
        <FormField label={label} required={required} error={error} hint={hint} htmlFor={textareaId}>
          <textarea
            ref={ref}
            id={textareaId}
            className={`form-input ${error ? "error" : ""} ${className}`}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            aria-required={required}
            {...props}
          />
        </FormField>
      );
    }

    return (
      <textarea
        ref={ref}
        id={textareaId}
        className={`form-input ${error ? "error" : ""} ${className}`}
        aria-describedby={describedBy}
        aria-invalid={!!error}
        aria-required={required}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, required, options, placeholder, id, className = "", ...props }, ref) => {
    const fieldId = useId();
    const selectId = id || fieldId;
    const errorId = `${selectId}-error`;
    const hintId = `${selectId}-hint`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

    if (label) {
      return (
        <FormField label={label} required={required} error={error} hint={hint} htmlFor={selectId}>
          <select
            ref={ref}
            id={selectId}
            className={`form-input ${error ? "error" : ""} ${className}`}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            aria-required={required}
            {...props}
          >
            {required ? <option value="" disabled>Select an option</option> : placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
      );
    }

    return (
      <select
        ref={ref}
        id={selectId}
        className={`form-input ${error ? "error" : ""} ${className}`}
        aria-describedby={describedBy}
        aria-invalid={!!error}
        aria-required={required}
        {...props}
      >
        {required ? <option value="" disabled>Select an option</option> : placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
);

Select.displayName = "Select";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, hint, required, id, className = "", ...props }, ref) => {
    const fieldId = useId();
    const checkboxId = id || fieldId;
    const errorId = `${checkboxId}-error`;
    const hintId = `${checkboxId}-hint`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

    return (
      <FormField label={label} required={required} error={error} hint={hint} htmlFor={checkboxId} className="checkbox-field">
        <div className="checkbox-wrapper">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={`form-checkbox ${className}`}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            aria-required={required}
            {...props}
          />
          <label htmlFor={checkboxId} className="checkbox-label">
            {label}
            {required && <span className="required" aria-hidden="true">*</span>}
          </label>
        </div>
        {error && (
          <p id={errorId} className="form-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="form-hint">
            {hint}
          </p>
        )}
      </FormField>
    );
  }
);

Checkbox.displayName = "Checkbox";

export interface RadioGroupProps {
  label: string;
  name: string;
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function RadioGroup({ label, name, options, value, onChange, error, hint, required, className = "" }: RadioGroupProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;
  const hintId = `${groupId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset className={`form-fieldset ${className}`} aria-describedby={describedBy}>
      <legend className="form-label">
        {label}
        {required && <span className="required" aria-hidden="true">*</span>}
      </legend>
      <div className="radio-group" role="radiogroup" aria-label={label} aria-required={required} aria-invalid={!!error} aria-describedby={describedBy}>
        {options.map((opt) => (
          <label key={opt.value} className="radio-option">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={(e) => onChange(e.target.value)}
              disabled={opt.disabled}
              className="form-radio"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="form-error" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

export interface ErrorSummaryProps {
  errors: { field: string; message: string }[];
  title?: string;
  onFocusField?: (field: string) => void;
  className?: string;
}

export function ErrorSummary({ errors, title = "There are errors in the form", onFocusField, className = "" }: ErrorSummaryProps) {
  const summaryId = useId();

  if (!errors.length) return null;

  return (
    <div
      id={summaryId}
      className={`error-summary ${className}`}
      role="alert"
      aria-labelledby={`${summaryId}-title`}
      tabIndex={-1}
    >
      <h2 id={`${summaryId}-title`} className="error-summary-title">
        {title}
      </h2>
      <ul className="error-summary-list">
        {errors.map((err, index) => (
          <li key={index} className="error-summary-item">
            <a
              href={`#${err.field}`}
              onClick={(e) => {
                e.preventDefault();
                onFocusField?.(err.field);
                const element = document.getElementById(err.field);
                element?.focus();
                element?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {err.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

import React from "react";