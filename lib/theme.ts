"use client";
import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Theme = "light" | "dark";
// Default is LIGHT: only a stored 'dark' paints dark. "system" stays a valid
// ThemeMode (effectiveTheme still supports it) but is never the fallback, and a
// legacy stored 'system' resolves to light — kept in sync with the anti-flicker
// inline script in app/layout.tsx.
export const THEME_KEY = "haven-dashboard-theme";

export const parseMode = (raw: unknown): ThemeMode => (raw === "light" || raw === "dark" || raw === "system" ? raw : "system");
export const effectiveTheme = (mode: ThemeMode, osDark: boolean): Theme => (mode === "system" ? (osDark ? "dark" : "light") : mode);

const osDark = () => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
// Missing/junk storage and legacy 'system' values all resolve to the light default.
const storedMode = (): ThemeMode => { try { const mode = parseMode(window.localStorage.getItem(THEME_KEY)); return mode === "system" ? "light" : mode; } catch { return "light"; } };
const currentTheme = (): Theme => effectiveTheme(storedMode(), osDark());

let listeners: (() => void)[] = [];
const emit = () => { for (const listener of listeners) listener(); };
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

// Only the light palette needs a class; the dark one is the base stylesheet.
const apply = (mode: ThemeMode) => document.documentElement.classList.toggle("theme-light", effectiveTheme(mode, osDark()) === "light");

// Follow the OS while the stored mode is "system".
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { apply(storedMode()); emit(); });
}

export function setMode(next: ThemeMode, event?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }) {
  const from = currentTheme();
  const to = effectiveTheme(next, osDark());
  const commit = () => {
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* private mode: theme still applies for this session */ }
    apply(next);
    emit();
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const canAnimate = typeof doc.startViewTransition === "function" && !doc.hidden && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!canAnimate || from === to) { commit(); return; }

  // Ripple origin: the pointer, else the button's centre, else the viewport centre.
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  const target = event?.currentTarget;
  if (event?.clientX || event?.clientY) { x = event.clientX ?? x; y = event.clientY ?? y; }
  else if (target instanceof Element) { const r = target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  const radius = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)));

  const root = document.documentElement;
  root.style.setProperty("--theme-x", `${Math.round(x)}px`);
  root.style.setProperty("--theme-y", `${Math.round(y)}px`);
  root.style.setProperty("--theme-r", `${radius}px`);
  root.dataset.themeTransition = to === "dark" ? "expand" : "shrink";
  try {
    const transition = doc.startViewTransition!(commit);
    transition.finished.catch(() => {}).finally(() => {
      delete root.dataset.themeTransition;
      for (const prop of ["--theme-x", "--theme-y", "--theme-r"]) root.style.removeProperty(prop);
    });
  } catch {
    // Browser refused to start the transition (document not fully active,
    // navigation in flight, etc.) — apply the theme without animation.
    commit();
  }
}

export function useTheme() {
  // Server/hydration snapshot is "dark" because that is what the base stylesheet paints;
  // the pre-paint script in app/layout.tsx has already added .theme-light for every
  // account without an explicit dark choice, and the store re-reads right after hydration.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);
  return { theme, setMode, toggle: (event?: Parameters<typeof setMode>[1]) => setMode(currentTheme() === "dark" ? "light" : "dark", event) };
}
