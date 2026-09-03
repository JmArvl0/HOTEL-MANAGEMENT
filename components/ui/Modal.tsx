"use client";

import { Fragment, ReactNode, useEffect, useId, useRef, useCallback, useState } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  disableFocusTrap?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  disableFocusTrap = false,
  initialFocusRef,
  returnFocusRef,
  className = "",
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const generatedId = useId();
  const titleId = `modal-title-${generatedId}`;
  const descriptionId = `modal-description-${generatedId}`;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!closeOnEscape || event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  }, [closeOnEscape, onClose]);

  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (!closeOnOverlayClick) return;
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  const trapFocus = useCallback((event: KeyboardEvent) => {
    if (disableFocusTrap || event.key !== "Tab" || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  }, [disableFocusTrap]);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", trapFocus);

    const modal = modalRef.current;
    if (modal) {
      modal.focus();
      setTimeout(() => {
        initialFocusRef?.current?.focus() ?? modal.focus();
      }, 0);
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", trapFocus);
      if (returnFocusRef?.current) {
        returnFocusRef.current.focus();
      } else if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, handleKeyDown, trapFocus, initialFocusRef, returnFocusRef]);

  if (!isOpen) return null;

  const prefersReducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <Fragment>
      <div
        className={`modal-backdrop ${prefersReducedMotion ? "reduce-motion" : ""}`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`modal ${sizeClasses[size]} ${className} ${prefersReducedMotion ? "reduce-motion" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h2 id={titleId} className="modal-title">{title}</h2>
            {description && (
              <p id={descriptionId} className="modal-description">
                {description}
              </p>
            )}
            {showCloseButton && (
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </Fragment>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "warning";
  loading?: boolean;
  disabled?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  loading = false,
  disabled = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    if (disabled) return;
    await onConfirm();
    onClose();
  };

  const confirmVariants = {
    default: "btn-accent",
    danger: "btn-accent danger-action",
    warning: "btn-accent",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
      initialFocusRef={{ current: document.querySelector('[data-action="cancel"]') as HTMLElement }}
    >
      <div className="confirm-dialog">
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-soft"
            data-action="cancel"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${confirmVariants[variant]}`}
            onClick={handleConfirm}
            disabled={loading || disabled}
          >
            {loading ? "Processing…" : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void | Promise<void>;
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "number" | "email" | "tel" | "password" | "date";
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  submitText?: string;
  cancelText?: string;
  validation?: (value: string) => string | null;
  loading?: boolean;
  multiline?: boolean;
  rows?: number;
}

export function PromptDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  label,
  placeholder,
  defaultValue = "",
  inputType = "text",
  required = false,
  min,
  max,
  step,
  submitText = "Submit",
  cancelText = "Cancel",
  validation,
  loading = false,
  multiline = false,
  rows = 4,
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (required && !value.trim()) {
      setError("This field is required");
      return;
    }
    if (validation) {
      const validationError = validation(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError("");
    await onSubmit(value);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
      initialFocusRef={inputRef}
    >
      <form onSubmit={handleSubmit} className="prompt-dialog">
        {message && <p className="prompt-message">{message}</p>}
        <div className="prompt-field">
          {label && <label htmlFor="prompt-input" className="prompt-label">{label}</label>}
          {multiline ? (
            <textarea
              ref={(el) => { inputRef.current = el; }}
              id="prompt-input"
              className={`prompt-input ${error ? "error" : ""}`}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required={required}
              minLength={required ? 1 : undefined}
              rows={rows}
              disabled={loading}
              aria-invalid={!!error}
              aria-describedby={error ? "prompt-error" : undefined}
            />
          ) : (
            <input
              ref={(el) => { inputRef.current = el; }}
              id="prompt-input"
              type={inputType}
              className={`prompt-input ${error ? "error" : ""}`}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required={required}
              min={min?.toString()}
              max={max?.toString()}
              step={step?.toString()}
              disabled={loading}
              aria-invalid={!!error}
              aria-describedby={error ? "prompt-error" : undefined}
            />
          )}
          {error && (
            <p id="prompt-error" className="prompt-error" role="alert">{error}</p>
          )}
        </div>
        <div className="prompt-actions">
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

export interface SelectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void | Promise<void>;
  title: string;
  message?: string;
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  defaultValue?: string;
  submitText?: string;
  cancelText?: string;
  required?: boolean;
  loading?: boolean;
  multiple?: boolean;
}

export function SelectDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  label,
  options,
  defaultValue = "",
  submitText = "Submit",
  cancelText = "Cancel",
  required = false,
  loading = false,
  multiple = false,
}: SelectDialogProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError("");
      setTimeout(() => selectRef.current?.focus(), 0);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (required && !value) {
      setError("Please select an option");
      return;
    }
    setError("");
    await onSubmit(value);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
      initialFocusRef={selectRef}
    >
      <form onSubmit={handleSubmit} className="prompt-dialog">
        {message && <p className="prompt-message">{message}</p>}
        <div className="prompt-field">
          {label && <label htmlFor="prompt-select" className="prompt-label">{label}</label>}
          <select
            ref={selectRef}
            id="prompt-select"
            className={`prompt-input ${error ? "error" : ""}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required={required}
            disabled={loading}
            multiple={multiple}
            aria-invalid={!!error}
            aria-describedby={error ? "prompt-error" : undefined}
          >
            {required ? <option value="" disabled>Select an option</option> : null}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          {error && <p id="prompt-error" className="prompt-error" role="alert">{error}</p>}
        </div>
        <div className="prompt-actions">
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

