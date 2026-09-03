"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Fragment, ReactNode } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal, ModalProps } from "./Modal";

export interface FormField {
  key: string;
  label: string;
  type: "text" | "number" | "email" | "tel" | "password" | "date" | "select" | "textarea" | "radio" | "checkbox";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string; disabled?: boolean }[];
  validation?: (value: string | number | boolean) => string | null;
  dependsOn?: string;
  showWhen?: (value: string | number | boolean) => boolean;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  disabled?: boolean;
  helpText?: string;
}

export interface FormDialogProps extends Omit<ModalProps, "children" | "footer"> {
  fields: FormField[];
  onSubmit: (data: Record<string, string | number | boolean>) => void | Promise<void>;
  submitText?: string;
  cancelText?: string;
  loading?: boolean;
  initialData?: Record<string, string | number | boolean>;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

export function FormDialog({
  isOpen,
  onClose,
  title,
  description,
  fields,
  onSubmit,
  submitText = "Submit",
  cancelText = "Cancel",
  loading = false,
  initialData = {},
  validateOnBlur = true,
  validateOnChange = false,
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = "",
}: FormDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const firstErrorRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const mergedValues = { ...initialData };
      fields.forEach((field) => {
        if (field.key in mergedValues) return;
        if (field.defaultValue !== undefined) {
          mergedValues[field.key] = field.defaultValue;
        } else if (field.type === "checkbox") {
          mergedValues[field.key] = false;
        } else if (field.type === "number") {
          mergedValues[field.key] = "";
        } else {
          mergedValues[field.key] = "";
        }
      });
      setValues(mergedValues);
      setErrors({});
      setTouched({});
      setSubmitted(false);
      setTimeout(() => {
        const firstField = formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea"
        );
        firstField?.focus();
      }, 0);
    }
  }, [isOpen, fields, initialData]);

  const validateField = useCallback(
    (key: string, value: string | number | boolean) => {
      const field = fields.find((f) => f.key === key);
      if (!field?.validation) return null;
      return field.validation(value);
    },
    [fields]
  );

  const validateAll = useCallback(() => {
    const newErrors: Record<string, string> = {};
    let firstErrorKey: string | null = null;

    fields.forEach((field) => {
      if (field.showWhen && !field.showWhen(values[field.dependsOn || ""])) return;
      const error = validateField(field.key, values[field.key]);
      if (error) {
        newErrors[field.key] = error;
        if (!firstErrorKey) firstErrorKey = field.key;
      }
    });

    setErrors(newErrors);
    if (firstErrorKey) {
      firstErrorRef.current = formRef.current?.querySelector(`[name="${firstErrorKey}"]`) ?? null;
      firstErrorRef.current?.focus();
    }
    return Object.keys(newErrors).length === 0;
  }, [fields, values, validateField]);

  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      if (touched[key] && validateOnChange) {
        const error = validateField(key, value);
        setErrors((prev) => ({ ...prev, [key]: error || "" }));
      }
    },
    [touched, validateOnChange, validateField]
  );

  const handleBlur = useCallback(
    (key: string) => {
      setTouched((prev) => ({ ...prev, [key]: true }));
      if (validateOnBlur) {
        const error = validateField(key, values[key]);
        setErrors((prev) => ({ ...prev, [key]: error || "" }));
      }
    },
    [validateOnBlur, validateField, values]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!validateAll()) return;
    setErrors({});
    await onSubmit(values);
    onClose();
  };

  const visibleFields = fields.filter(
    (field) => !field.showWhen || field.showWhen(values[field.dependsOn || ""])
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      showCloseButton={showCloseButton}
      closeOnOverlayClick={closeOnOverlayClick}
      closeOnEscape={closeOnEscape}
      className={className}
      initialFocusRef={formRef as unknown as React.RefObject<HTMLElement>}
    >
      <form ref={formRef} onSubmit={handleSubmit} className="form-dialog" noValidate>
        {visibleFields.map((field) => (
          <div key={field.key} className="form-field">
            {field.type === "radio" && field.options ? (
              <fieldset className="form-fieldset">
                <legend className="form-label">{field.label}{field.required && <span className="required">*</span>}</legend>
                {field.options.map((opt) => (
                  <label key={opt.value} className="radio-option">
                    <input
                      type="radio"
                      name={field.key}
                      value={opt.value}
                      checked={values[field.key] === opt.value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      onBlur={() => handleBlur(field.key)}
                      disabled={field.disabled || loading || opt.disabled}
                      required={field.required}
                      aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                      aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
              </fieldset>
            ) : field.type === "checkbox" ? (
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  name={field.key}
                  checked={values[field.key] as boolean}
                  onChange={(e) => handleChange(field.key, e.target.checked)}
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                />
                <span>{field.label}{field.required && <span className="required">*</span>}</span>
              </label>
            ) : field.type === "select" ? (
              <div className="form-field-wrapper">
                <label htmlFor={field.key} className="form-label">
                  {field.label}{field.required && <span className="required">*</span>}
                </label>
                <select
                  id={field.key}
                  name={field.key}
                  className={`form-input ${errors[field.key] && (touched[field.key] || submitted) ? "error" : ""}`}
                  value={values[field.key] as string}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                >
                  {field.required ? <option value="" disabled>Select an option</option> : <option value="">—</option>}
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
                {field.helpText && <p className="form-help">{field.helpText}</p>}
              </div>
            ) : field.type === "textarea" ? (
              <div className="form-field-wrapper">
                <label htmlFor={field.key} className="form-label">
                  {field.label}{field.required && <span className="required">*</span>}
                </label>
                <textarea
                  id={field.key}
                  name={field.key}
                  className={`form-input ${errors[field.key] && (touched[field.key] || submitted) ? "error" : ""}`}
                  placeholder={field.placeholder}
                  value={values[field.key] as string}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  rows={field.rows || 4}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                />
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
                {field.helpText && <p className="form-help">{field.helpText}</p>}
              </div>
            ) : (
              <div className="form-field-wrapper">
                <label htmlFor={field.key} className="form-label">
                  {field.label}{field.required && <span className="required">*</span>}
                </label>
                <input
                  id={field.key}
                  name={field.key}
                  type={field.type}
                  className={`form-input ${errors[field.key] && (touched[field.key] || submitted) ? "error" : ""}`}
                  placeholder={field.placeholder}
                  value={values[field.key] as string}
                  onChange={(e) =>
                    handleChange(
                      field.key,
                      field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                    )
                  }
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  min={field.min?.toString()}
                  max={field.max?.toString()}
                  step={field.step?.toString()}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                />
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
                {field.helpText && <p className="form-help">{field.helpText}</p>}
              </div>
            )}
          </div>
        ))}
        <div className="form-actions">
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button type="submit" className="btn btn-accent" disabled={loading}>
            {loading ? "Submitting…" : submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export interface MultiStepFormDialogProps extends Omit<ModalProps, "children" | "footer"> {
  steps: {
    title: string;
    description?: string;
    fields: FormField[];
  }[];
  onSubmit: (data: Record<string, string | number | boolean>) => void | Promise<void>;
  submitText?: string;
  cancelText?: string;
  nextText?: string;
  backText?: string;
  loading?: boolean;
  initialData?: Record<string, string | number | boolean>;
}

export function MultiStepFormDialog({
  isOpen,
  onClose,
  title,
  description,
  steps,
  onSubmit,
  submitText = "Submit",
  cancelText = "Cancel",
  nextText = "Continue",
  backText = "Back",
  loading = false,
  initialData = {},
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = "",
}: MultiStepFormDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const mergedValues = { ...initialData };
      steps.forEach((step) => {
        step.fields.forEach((field) => {
          if (field.key in mergedValues) return;
          if (field.defaultValue !== undefined) {
            mergedValues[field.key] = field.defaultValue;
          } else if (field.type === "checkbox") {
            mergedValues[field.key] = false;
          } else if (field.type === "number") {
            mergedValues[field.key] = "";
          } else {
            mergedValues[field.key] = "";
          }
        });
      });
      setValues(mergedValues);
      setErrors({});
      setTouched({});
      setSubmitted(false);
      setCurrentStep(0);
    }
  }, [isOpen, steps, initialData]);

  const validateStep = useCallback(
    (stepIndex: number) => {
      const step = steps[stepIndex];
      const newErrors: Record<string, string> = {};

      step.fields.forEach((field) => {
        if (field.showWhen && !field.showWhen(values[field.dependsOn || ""])) return;
        if (field.validation) {
          const error = field.validation(values[field.key]);
          if (error) newErrors[field.key] = error;
        } else if (field.required) {
          const value = values[field.key];
          if (value === "" || value === false || (Array.isArray(value) && value.length === 0)) {
            newErrors[field.key] = `${field.label} is required`;
          }
        }
      });

      setErrors((prev) => ({ ...prev, ...newErrors }));
      return Object.keys(newErrors).length === 0;
    },
    [steps, values]
  );

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!validateStep(currentStep)) return;
    if (currentStep < steps.length - 1) {
      handleNext();
      return;
    }
    await onSubmit(values);
    onClose();
  };

  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleBlur = useCallback((key: string) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }, []);

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description || currentStepData.description}
      size={size}
      showCloseButton={showCloseButton}
      closeOnOverlayClick={closeOnOverlayClick}
      closeOnEscape={closeOnEscape}
      className={className}
    >
      <form onSubmit={handleSubmit} className="form-dialog multistep-form" noValidate>
        <div className="multistep-progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label="Form progress">
          {steps.map((_, index) => (
            <div key={index} className={`multistep-step ${index <= currentStep ? "completed" : ""} ${index === currentStep ? "active" : ""}`}>
              <span className="multistep-step-number">{index + 1}</span>
            </div>
          ))}
        </div>

        {currentStepData.fields.map((field) => (
          <div key={field.key} className="form-field">
            {field.type === "radio" && field.options ? (
              <fieldset className="form-fieldset">
                <legend className="form-label">{field.label}{field.required && <span className="required">*</span>}</legend>
                {field.options.map((opt) => (
                  <label key={opt.value} className="radio-option">
                    <input
                      type="radio"
                      name={field.key}
                      value={opt.value}
                      checked={values[field.key] === opt.value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      onBlur={() => handleBlur(field.key)}
                      disabled={field.disabled || loading || opt.disabled}
                      required={field.required}
                      aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                      aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
              </fieldset>
            ) : field.type === "checkbox" ? (
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  name={field.key}
                  checked={values[field.key] as boolean}
                  onChange={(e) => handleChange(field.key, e.target.checked)}
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                />
                <span>{field.label}{field.required && <span className="required">*</span>}</span>
              </label>
            ) : field.type === "select" ? (
              <div className="form-field-wrapper">
                <label htmlFor={field.key} className="form-label">
                  {field.label}{field.required && <span className="required">*</span>}
                </label>
                <select
                  id={field.key}
                  name={field.key}
                  className={`form-input ${errors[field.key] && (touched[field.key] || submitted) ? "error" : ""}`}
                  value={values[field.key] as string}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                >
                  {field.required ? <option value="" disabled>Select an option</option> : <option value="">—</option>}
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
                {field.helpText && <p className="form-help">{field.helpText}</p>}
              </div>
            ) : field.type === "textarea" ? (
              <div className="form-field-wrapper">
                <label htmlFor={field.key} className="form-label">
                  {field.label}{field.required && <span className="required">*</span>}
                </label>
                <textarea
                  id={field.key}
                  name={field.key}
                  className={`form-input ${errors[field.key] && (touched[field.key] || submitted) ? "error" : ""}`}
                  placeholder={field.placeholder}
                  value={values[field.key] as string}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  rows={field.rows || 4}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                />
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
                {field.helpText && <p className="form-help">{field.helpText}</p>}
              </div>
            ) : (
              <div className="form-field-wrapper">
                <label htmlFor={field.key} className="form-label">
                  {field.label}{field.required && <span className="required">*</span>}
                </label>
                <input
                  id={field.key}
                  name={field.key}
                  type={field.type}
                  className={`form-input ${errors[field.key] && (touched[field.key] || submitted) ? "error" : ""}`}
                  placeholder={field.placeholder}
                  value={values[field.key] as string}
                  onChange={(e) =>
                    handleChange(
                      field.key,
                      field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                    )
                  }
                  onBlur={() => handleBlur(field.key)}
                  disabled={field.disabled || loading}
                  required={field.required}
                  min={field.min?.toString()}
                  max={field.max?.toString()}
                  step={field.step?.toString()}
                  aria-invalid={!!(errors[field.key] && (touched[field.key] || submitted))}
                  aria-describedby={errors[field.key] && (touched[field.key] || submitted) ? `${field.key}-error` : undefined}
                />
                {errors[field.key] && (touched[field.key] || submitted) && (
                  <p id={`${field.key}-error`} className="form-error" role="alert">{errors[field.key]}</p>
                )}
                {field.helpText && <p className="form-help">{field.helpText}</p>}
              </div>
            )}
          </div>
        ))}

        <div className="form-actions multistep-actions">
          {currentStep > 0 && (
            <button type="button" className="btn btn-soft" onClick={handleBack} disabled={loading}>
              <ChevronLeft size={16} aria-hidden="true" /> {backText}
            </button>
          )}
          {currentStep === 0 && <div style={{ width: "80px" }} />}
          {isLastStep ? (
            <button type="submit" className="btn btn-accent" disabled={loading}>
              {loading ? "Submitting…" : submitText}
            </button>
          ) : (
            <button type="button" className="btn btn-accent" onClick={handleNext} disabled={loading}>
              {nextText} <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
          {!isLastStep && <button type="button" className="btn btn-soft" onClick={onClose} disabled={loading}>{cancelText}</button>}
        </div>
      </form>
    </Modal>
  );
}

export interface RoomSelectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (roomNumber: string) => void;
  title: string;
  message: string;
  rooms: { number: string; type: string; id?: string }[];
  currentRoom?: string;
  loading?: boolean;
}

export function RoomSelectDialog({
  isOpen,
  onClose,
  onSelect,
  title,
  message,
  rooms,
  currentRoom,
  loading = false,
}: RoomSelectDialogProps) {
  const [selectedRoom, setSelectedRoom] = useState(currentRoom || "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelectedRoom(currentRoom || (rooms[0]?.number || ""));
      setError("");
    }
  }, [isOpen, currentRoom, rooms]);

  const handleSubmit = () => {
    if (!selectedRoom) {
      setError("Please select a room");
      return;
    }
    if (!rooms.some((r) => r.number === selectedRoom || r.id === selectedRoom)) {
      setError("Choose one of the eligible rooms shown");
      return;
    }
    setError("");
    onSelect(selectedRoom);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="md"
    >
      <div className="room-select-dialog">
        <p className="room-select-message">{message}</p>
        {error && <p className="room-select-error" role="alert">{error}</p>}
        <div className="room-select-options" role="radiogroup" aria-label="Available rooms">
          {rooms.map((room) => (
            <label key={room.number || room.id} className="room-option">
              <input
                type="radio"
                name="room-select"
                value={room.number}
                checked={selectedRoom === room.number}
                onChange={(e) => setSelectedRoom(e.target.value)}
                disabled={loading}
              />
              <div className="room-option-info">
                <strong>Room {room.number}</strong>
                <span className="room-type">{room.type}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="room-select-actions">
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn btn-accent" onClick={handleSubmit} disabled={loading}>
            {loading ? "Selecting…" : "Select Room"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export interface ChecklistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, boolean>) => void | Promise<void>;
  title: string;
  message?: string;
  items: { key: string; label: string }[];
  submitText?: string;
  cancelText?: string;
  loading?: boolean;
}

export function ChecklistDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  items,
  submitText = "Complete",
  cancelText = "Cancel",
  loading = false,
}: ChecklistDialogProps) {
  const [values, setValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, boolean> = {};
      items.forEach((item) => {
        initial[item.key] = false;
      });
      setValues(initial);
    }
  }, [isOpen, items]);

  const handleChange = (key: string, checked: boolean) => {
    setValues((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSubmit = async () => {
    await onSubmit(values);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="md"
    >
      <div className="checklist-dialog">
        {message && <p className="checklist-message">{message}</p>}
        <div className="checklist-items" role="group" aria-label="Checklist items">
          {items.map((item) => (
            <label key={item.key} className="checklist-item">
              <input
                type="checkbox"
                checked={values[item.key]}
                onChange={(e) => handleChange(item.key, e.target.checked)}
                disabled={loading}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <div className="checklist-actions">
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button type="button" className="btn btn-accent" onClick={handleSubmit} disabled={loading}>
            {loading ? "Completing…" : submitText}
          </button>
        </div>
      </div>
    </Modal>
  );
}