import type { CSSProperties, ReactNode } from "react";

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

/**
 * Panel-shaped placeholder — mimics a data panel card.
 * Renders a tile skeleton + optional header line.
 */
export interface HavenSkeletonCardProps {
  /** Show a header line above the tile. */
  hasHeader?: boolean;
  className?: string;
}

export function HavenSkeletonCard({ hasHeader = true, className }: HavenSkeletonCardProps) {
  return (
    <div className={`haven-skeleton-card ${className ?? ""}`} role="status" aria-label="Loading panel">
      {hasHeader && <HavenSkeleton size="sm" width="40%" />}
      <HavenSkeleton size="tile" />
    </div>
  );
}

/**
 * Table row placeholder — renders a tr-shaped skeleton with configurable cells.
 */
export interface HavenSkeletonTableRowProps {
  /** Number of cells in the row (default 5). */
  cells?: number;
  /** Cell size mix: "md" | "lg" | "mixed" (alternates md/lg). */
  cellSize?: "md" | "lg" | "mixed";
  className?: string;
}

export function HavenSkeletonTableRow({ cells = 5, cellSize = "mixed", className }: HavenSkeletonTableRowProps) {
  const row = [];
  for (let i = 0; i < cells; i++) {
    const size = cellSize === "mixed" ? (i % 2 === 0 ? "md" : "lg") : cellSize;
    row.push(<HavenSkeleton key={i} size={size} width="80%" />);
  }
  return (
    <div className={`haven-skeleton-table-row ${className ?? ""}`} role="status" aria-label="Loading row">
      {row}
    </div>
  );
}

/**
 * Vertical list placeholder — stack of line skeletons.
 */
export interface HavenSkeletonListProps {
  /** Number of lines (default 4). */
  lines?: number;
  /** Line size. */
  lineSize?: "sm" | "md" | "lg";
  className?: string;
}

export function HavenSkeletonList({ lines = 4, lineSize = "md", className }: HavenSkeletonListProps) {
  return (
    <div className={`haven-skeleton-list ${className ?? ""}`} role="status" aria-label="Loading list">
      {Array.from({ length: lines }).map((_, i) => (
        <HavenSkeleton key={i} size={lineSize} width="90%" />
      ))}
    </div>
  );
}

/**
 * KPI card placeholder — chip + value line + trend line.
 */
export interface HavenSkeletonKPIProps {
  className?: string;
}

export function HavenSkeletonKPI({ className }: HavenSkeletonKPIProps) {
  return (
    <div className={`haven-skeleton-kpi ${className ?? ""}`} role="status" aria-label="Loading KPI">
      <HavenSkeleton size="sm" width="46px" height="46px" radius="12px" />
      <HavenSkeleton size="lg" width="60%" />
      <HavenSkeleton size="sm" width="40%" />
    </div>
  );
}