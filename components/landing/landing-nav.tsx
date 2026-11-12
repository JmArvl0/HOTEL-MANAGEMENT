"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowUp, CalendarDays, MapPin, Menu, UserRound, X } from "lucide-react";
import { HavenLogo } from "@/components/ui/haven-logo";

const drawerLinks = [
  { href: "#stay", label: "Rooms" },
  { href: "#amenities", label: "Amenities & dining" },
  { href: "#gallery", label: "Gallery" },
  { href: "#how-to-go", label: "Location" },
  { href: "#contact", label: "Contact" },
  { href: "#faq", label: "FAQ" },
  { href: "#book", label: "Check availability" },
];

export function LandingNav({ active, rootLinks = false, bookingHref, identity, contact, visibleSections, overHero = false }: {
  active?: string; rootLinks?: boolean; bookingHref?: string; overHero?: boolean;
  identity?: { name: string; shortName: string; district?: string; city?: string }; contact?: { phone: string; frontDeskHours: string; isDemo: boolean };
  visibleSections?: { gallery: boolean; amenities: boolean; faq: boolean };
} = {}) {
  const [open, setOpen] = useState(false);
  const [headerState, setHeaderState] = useState<"top" | "glass" | "ivory">("top");
  const [section, setSection] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const nav = useRef<HTMLElement>(null);
  const linkList = useRef<HTMLDivElement>(null);
  const links = useMemo(() => drawerLinks.flatMap(link => {
    if (link.href === "#amenities") {
      if (visibleSections?.amenities === false) return [];
      if (overHero) return [{ href: "#amenities", label: "Amenities" }, { href: "#dining", label: "Dining" }];
    }
    if ((link.href === "#gallery" && visibleSections?.gallery === false) || (link.href === "#faq" && visibleSections?.faq === false)) return [];
    // The demo contact anchor aliases Location rather than a separate section.
    if (link.href === "#contact" && contact?.isDemo) return [];
    return [link];
  }), [overHero, visibleSections?.amenities, visibleSections?.gallery, visibleSections?.faq, contact?.isDemo]);
  const destination = (href: string) => href === "#book" ? bookingHref ?? (rootLinks ? "/#book" : "#book") : rootLinks ? `/${href}` : href;
  const current = (link: typeof drawerLinks[number]) => active === link.label ? "page" : section === link.href ? "location" : undefined;

  function restoreAmenitiesScroll(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (href !== "#amenities" || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    document.querySelectorAll<HTMLElement>("#amenities .hotel-amenities-layout, #amenities .hotel-amenities-facilities, #amenities .hotel-dining").forEach(element => { element.scrollTop = 0; });
  }

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const headerHeight = nav.current?.offsetHeight ?? 88;
      const hero = overHero ? document.querySelector(".hotel-hero-stage > .hotel-hero") : null;
      const pastHero = hero && hero.getBoundingClientRect().bottom <= (nav.current?.offsetHeight ?? 0);
      setHeaderState(window.scrollY <= 24 ? "top" : pastHero ? "ivory" : "glass");
      setShowBackToTop(window.scrollY > Math.max(320, window.innerHeight * .6));
      if (rootLinks) return;

      // Read document order, including nested Dining, instead of the URL hash.
      // The marker sits just below the fixed header, leaving anchor headings visible.
      const marker = headerHeight + Math.min(96, window.innerHeight * .12);
      const sections = links.flatMap(link => {
        const element = document.getElementById(link.href.slice(1));
        if (!element || element.tagName === "SPAN") return [];
        // The bounded amenities frame can show Dining beside the facilities.
        // Its nested card takes the underline only when explicitly navigated to.
        if (link.href === "#dining" && element.closest(".hotel-amenities-section") && window.location.hash !== "#dining") return [];
        const bounds = element.getBoundingClientRect();
        return bounds.height > 0 ? [{ href: link.href, top: bounds.top }] : [];
      }).sort((a, b) => a.top - b.top);
      const passed = sections.filter(item => item.top <= marker);
      const atBottom = window.scrollY > 24 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      setSection((atBottom ? sections.at(-1) : passed.at(-1))?.href ?? "");
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (nav.current) {
      observer?.observe(nav.current);
      if (nav.current.parentElement) observer?.observe(nav.current.parentElement);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [overHero, rootLinks, links]);

  useLayoutEffect(() => {
    const list = linkList.current;
    if (!list) return;
    const measure = () => {
      const selected = list.querySelector<HTMLElement>("a[aria-current]");
      setIndicator({ left: selected?.offsetLeft ?? 0, width: selected?.offsetWidth ?? 0 });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    list.querySelectorAll("a").forEach(link => observer?.observe(link));
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [active, section, links]);

  const backToTop = () => {
    // Keep reload/back from returning to the old section after going to the top.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    nav.current?.querySelector<HTMLElement>(".brand")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

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

  const brand = <Link href="/" className="brand brand-light" aria-label={`${identity?.name ?? "Haven Hotel"} home`}>
    <span className="brand-mark" aria-hidden="true"><HavenLogo size={40} small={overHero} /></span>
    <span>{identity?.shortName ?? "HAVEN"}<small>HOTEL &amp; RESIDENCES</small></span>
  </Link>;

  return (
    <>
      <nav ref={nav} className={`landing-nav${overHero ? " landing-nav--hero" : ""}${headerState !== "top" ? " is-scrolled" : ""}`} data-header-state={overHero ? headerState : undefined} aria-label="Primary">
        {overHero ? <div className="landing-brand-group">
          {brand}
          {identity?.district && identity.city && <a className="landing-nav-place" href={destination("#how-to-go")}><MapPin size={15} aria-hidden="true" />{identity.district}, {identity.city}</a>}
        </div> : brand}

        <div className="nav-links" ref={linkList}>
          {links.filter(link => link.href !== "#book").map((l) => (
            <a key={l.href} href={destination(l.href)} aria-current={current(l)} onClick={event => restoreAmenitiesScroll(event, l.href)}>
              {l.label}
            </a>
          ))}
          <span className="landing-nav-indicator" aria-hidden="true" style={{ transform: `translateX(${indicator.left}px) scaleX(${indicator.width})`, opacity: indicator.width ? 1 : 0 }} />
        </div>

        <div className="landing-actions">
          <Link href="/account" className="sign-in-link">
            {overHero && <UserRound size={15} aria-hidden="true" />}{overHero ? "My Account" : "My account"}
          </Link>
          <a href={destination("#book")} className="btn btn-cream btn-nav-cta" aria-label="Check availability" aria-current={current({ href: "#book", label: "Check availability" })}>
            {overHero && <CalendarDays size={15} aria-hidden="true" />}
            <span className="nav-book-long">Check availability</span><span className="nav-book-short" aria-hidden="true">Book</span>
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
            {links.map((l, i) => (
              <a key={l.href} href={destination(l.href)} aria-current={current(l)} onClick={event => { restoreAmenitiesScroll(event, l.href); setOpen(false); }} style={{ "--dr": i } as React.CSSProperties}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="landing-drawer-actions">
            <Link href={overHero ? "/account" : "/login"} className="btn btn-accent" onClick={() => setOpen(false)}>
              {overHero ? "My Account" : "Sign in"}
            </Link>
            <a href={destination("#book")} className="btn btn-cream" onClick={() => setOpen(false)}>
              Check availability
            </a>
          </div>
          <div className="landing-drawer-foot">{contact && !contact.isDemo ? <a href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`}>Call Front Desk · {contact.frontDeskHours}</a> : "Contact Front Desk for arrival and stay information."}</div>
        </div>
        <button type="button" className="landing-drawer-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} tabIndex={-1} />
      </div>
      {showBackToTop && !open && <button type="button" className="landing-back-to-top" onClick={backToTop} aria-label="Back to top" title="Back to top">
        <ArrowUp size={20} aria-hidden="true" />
        <span>Top</span>
      </button>}
    </>
  );
}
