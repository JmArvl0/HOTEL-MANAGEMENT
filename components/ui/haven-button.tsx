import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type HavenButtonVariant = "primary" | "secondary" | "neutral" | "danger";
export type HavenButtonDensity = "internal" | "customer";

export type HavenButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: HavenButtonVariant;
  density?: HavenButtonDensity;
  icon?: ReactNode;
};

/** Semantic HAVEN action button. Status values must use StatusBadge instead. */
export const HavenButton = forwardRef<HTMLButtonElement, HavenButtonProps>(function HavenButton(
  { variant = "primary", density = "internal", icon, className = "", children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn haven-button haven-button--${variant} haven-button--${density} ${className}`.trim()}
      {...props}
    >
      {icon && <span className="haven-button-icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
});
