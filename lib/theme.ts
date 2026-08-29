"use client";
import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Theme = "light" | "dark";
/** Kept in sync with the anti-flicker inline script in app/layout.tsx. */
export const THEME_KEY = "haven-dashboard-theme";

export const parseMode = (raw: unknown): ThemeMode => (raw === "light" || raw === "dark" || raw === "system" ? raw : "system");
export const effectiveTheme = (mode: ThemeMode, osDark: boolean): Theme => (mode === "system" ? (osDark ? "dark" : "light") : mode);

const osDark = () => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
const storedMode = (): ThemeMode => { try { return parseMode(window.localStorage.getItem(THEME_KEY)); } catch { return "system"; } };
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
  doc.startViewTransition!(commit).finished.catch(() => {}).finally(() => {
    delete root.dataset.themeTransition;
    for (const prop of ["--theme-x", "--theme-y", "--theme-r"]) root.style.removeProperty(prop);
  });
}

export function useTheme() {
  // Server/hydration snapshot is "dark" because that is what the base stylesheet paints.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);
  return { theme, setMode, toggle: (event?: Parameters<typeof setMode>[1]) => setMode(currentTheme() === "dark" ? "light" : "dark", event) };
}
