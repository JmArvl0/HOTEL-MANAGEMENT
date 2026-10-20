import type { CSSProperties } from "react";

/**
 * Shared loading-placeholder atom (Stage 3 3c, single-home: app/ui-primitives.css §8).
 * Panels wrap it in their own `role="status"` container with an honest aria-label;
 * the atom itself carries no semantics.
 */
export interface HavenSkeletonProps {
  size?: "sm" | "md" | "lg" | "tile";
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  /** Stretch across the row (notification-style icon+line skeletons). */
  grow?: boolean;
  className?: string;
}

export function HavenSkeleton({ size = "md", width, height, radius, grow, className }: HavenSkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  if (radius !== undefined) style.borderRadius = radius;
  if (grow) style.flex = "1 1 auto";
  return (
    <span
      aria-hidden="true"
      className={className ? `haven-skeleton ${className}` : "haven-skeleton"}
      data-size={size}
      style={style}
    />
  );
}
