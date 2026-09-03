"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Sparkles, X } from "lucide-react";

const links = [
  { href: "#stay", label: "Rooms" },
  { href: "#experience", label: "Experience" },
  { href: "#amenities", label: "Amenities" },
  { href: "#gallery", label: "Gallery" },
  { href: "#about", label: "About" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // a11y: close on escape, trap focus, lock scroll, restore focus
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const panel = document.querySelector<HTMLElement>(".landing-drawer-panel");
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // move focus into drawer
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>(".landing-drawer-panel a, .landing-drawer-panel button");
      first?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus();
    };
  }, [open]);

  return (
    <>
      <nav className={`landing-nav ${scrolled ? "is-scrolled" : ""}`} aria-label="Primary">
        <Link href="/" className="brand brand-light" aria-label="Haven Hotel home">
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <span>
            HAVEN<small>HOTEL & RESIDENCES</small>
          </span>
        </Link>

        <div className="nav-links">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="landing-actions">
          <Link href="/login" className="sign-in-link">
            Sign in
          </Link>
          <a href="#book" className="btn btn-cream btn-nav-cta">
            Book now
          </a>
          <button
            type="button"
            className="landing-menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="landing-drawer"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer — accessible without inert for Safari compat */}
      <div
        id="landing-drawer"
        className={`landing-drawer ${open ? "open" : ""}`}
        aria-hidden={!open}
        style={{ display: open ? "block" : "none" }}
      >
        <div className="landing-drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="landing-drawer-head">
            <span className="eyebrow" style={{ margin: 0 }}>
              Navigate Haven
            </span>
            <button type="button" className="landing-drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <nav className="landing-drawer-links">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <a href="#faq" onClick={() => setOpen(false)}>
              FAQ
            </a>
            <a href="#book" onClick={() => setOpen(false)}>
              Check availability
            </a>
          </nav>
          <div className="landing-drawer-actions">
            <Link href="/login" className="btn btn-accent" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <a href="#book" className="btn btn-cream" onClick={() => setOpen(false)}>
              Book now
            </a>
          </div>
          <p className="landing-drawer-foot">Front Desk · 24 hours · Wi-Fi throughout</p>
        </div>
        <button type="button" className="landing-drawer-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} tabIndex={-1} />
      </div>
    </>
  );
}
