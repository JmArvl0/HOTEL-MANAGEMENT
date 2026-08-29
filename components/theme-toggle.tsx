"use client";
import { useTheme } from "@/lib/theme";

const rays: [number, number, number, number][] = [[12,1,12,3],[12,21,12,23],[4.22,4.22,5.64,5.64],[18.36,18.36,19.78,19.78],[1,12,3,12],[21,12,23,12],[4.22,19.78,5.64,18.36],[18.36,5.64,19.78,4.22]];

/** Sun in dark mode, moon in light mode — the icon shows what a click gives you. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <button type="button" className={`icon-button theme-toggle theme-toggle-btn ${className}`} onClick={toggle} aria-label={label} title={label}>
      <svg className="theme-toggle-icon" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <mask id="theme-toggle-cut">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="tt-cut" fill="#000" />
        </mask>
        <circle className="tt-core" cx="12" cy="12" fill="currentColor" mask="url(#theme-toggle-cut)" />
        <g className="tt-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {rays.map(([x1, y1, x2, y2]) => <line key={`${x1}${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
        </g>
      </svg>
    </button>
  );
}
