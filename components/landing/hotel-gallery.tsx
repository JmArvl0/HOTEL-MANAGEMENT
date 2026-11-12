"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BedDouble, Building2, ChevronLeft, ChevronRight, Expand, Grid2X2, Landmark, Leaf, Utensils, X } from "lucide-react";
import { WEBSITE_GALLERY_CATEGORIES, type WebsiteGalleryCategory } from "@/lib/website-content";
import type { HotelGalleryPhoto } from "@/lib/website-gallery";
import "./hotel-gallery.css";

type Category = "All Photos" | WebsiteGalleryCategory;
const categoryIcons = { "All Photos": Grid2X2, Exterior: Building2, Rooms: BedDouble, Dining: Utensils, Amenities: Leaf, "Shared Spaces": Landmark };
const wrap = (value: number, length: number) => (value + length) % length;

function GalleryWaves() {
  return <svg className="haven-gallery-waves" viewBox="0 0 1600 920" preserveAspectRatio="none" aria-hidden="true">
    <g>{Array.from({ length: 9 }, (_, index) => <path key={`top-${index}`} d={`M900 ${-75 + index * 9} C1180 ${190 + index * 6}, 1330 ${165 + index * 8}, 1630 ${5 + index * 8}`} />)}</g>
    <g>{Array.from({ length: 9 }, (_, index) => <path key={`bottom-${index}`} d={`M-80 ${805 + index * 8} C240 ${655 + index * 8}, 340 ${1000 + index * 6}, 720 ${885 + index * 7} S1340 ${990 + index * 7}, 1680 ${720 + index * 8}`} />)}</g>
  </svg>;
}

export function HotelGalleryCarousel({ photos, preview = false }: { photos: HotelGalleryPhoto[]; preview?: boolean }) {
  const [category, setCategory] = useState<Category>("Exterior");
  const [selectedId, setSelectedId] = useState<string | undefined>(() => (photos.find(item => item.categories.includes("Exterior")) ?? photos[0])?.id);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const collectionTrigger = useRef<HTMLButtonElement>(null);
  const collectionScroll = useRef(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const id = useId();
  const filtered = category === "All Photos" ? photos : photos.filter(item => item.categories.includes(category));
  const selected = Math.max(0, filtered.findIndex(item => item.id === selectedId));
  const current = filtered[selected];
  const lightboxIndex = photos.findIndex(item => item.id === lightboxId);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  function chooseCategory(next: Category) {
    setCategory(next);
    setSelectedId((next === "All Photos" ? photos[0] : photos.find(item => item.categories.includes(next)))?.id);
  }

  function openCollection() {
    collectionScroll.current = window.scrollY;
    setCollectionOpen(true);
  }

  function closeCollection() {
    setCollectionOpen(false);
    collectionTrigger.current?.focus({ preventScroll: true });
    window.scrollTo({ top: collectionScroll.current, behavior: "instant" });
  }
  function step(delta: number) {
    if (filtered.length > 1) setSelectedId(filtered[wrap(selected + delta, filtered.length)].id);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); }
    if (event.key === "Home" && filtered.length) { event.preventDefault(); setSelectedId(filtered[0].id); }
    if (event.key === "End" && filtered.length) { event.preventDefault(); setSelectedId(filtered[filtered.length - 1].id); }
  }
  function beginSwipe(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (event.pointerType === "mouse") return;
    gesture.current = { x: event.clientX, y: event.clientY };
  }
  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.25) { suppressClick.current = true; step(x < 0 ? 1 : -1); }
  }

  // A moving five-photo window keeps a long CMS gallery compact.
  const thumbnailStart = Math.max(0, Math.min(selected - 2, filtered.length - 5));
  const thumbnails = filtered.slice(thumbnailStart, thumbnailStart + 5);
  const slides = filtered.length === 2 ? [...filtered, filtered[wrap(selected + 1, 2)]] : filtered;

  return <div ref={rootRef} className={`haven-gallery${revealed ? " is-revealed" : ""}${preview ? " haven-gallery-preview" : ""}`}>
    <GalleryWaves />
    <header className="haven-gallery-heading">
      <div className="haven-gallery-flourish" aria-hidden="true"><span /><Leaf size={29} strokeWidth={1.2} /><span /></div>
      <h2 id={`${id}-title`}>Inside Haven</h2>
      <p>Preview the spaces that shape your stay.</p>
    </header>
    <div className="haven-gallery-filters" role="group" aria-label="Photo categories">
      {(["All Photos", ...WEBSITE_GALLERY_CATEGORIES] as const).map(name => {
        const Icon = categoryIcons[name];
        return <button key={name} type="button" aria-pressed={category === name} aria-controls={`${id}-carousel`} onClick={() => chooseCategory(name)}><Icon size={19} strokeWidth={1.5} aria-hidden="true" /><span>{name}</span></button>;
      })}
    </div>
    <div id={`${id}-carousel`} className="haven-gallery-carousel" role="region" aria-roledescription="carousel" aria-label={`${category} photos`} onKeyDown={onKeyDown}>
      <div key={category} className="haven-gallery-category-content">
        {current ? <>
          <div className="haven-gallery-stage" onPointerDown={beginSwipe} onPointerUp={endSwipe} onPointerCancel={() => { gesture.current = null; }}>
            {slides.map((item, index) => {
              const position = index === selected ? "current" : index === 2 && filtered.length === 2 ? "next" : index === wrap(selected - 1, filtered.length) ? "previous" : index === wrap(selected + 1, filtered.length) ? "next" : "away";
              return <button key={`${item.id}-${index}`} type="button" className={`haven-gallery-slide is-${position}`} tabIndex={index === selected ? 0 : -1} aria-hidden={position === "away"} aria-label={index === selected ? `View ${item.label} fullscreen` : `Show ${item.label}`} onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                if (index === selected) { if (!preview) setLightboxId(item.id); }
                else setSelectedId(item.id);
              }}>
                {failedIds.includes(item.id) ? <span className="haven-gallery-unavailable">Photo unavailable.{!preview && " Open the gallery to try again."}</span> : <Image src={item.photo.src} alt={index === selected ? item.alt : ""} fill unoptimized={preview} sizes="(max-width:680px) 92vw, 66vw" draggable={false} style={{ objectPosition: item.photo.objectPosition }} onError={() => setFailedIds(ids => ids.includes(item.id) ? ids : [...ids, item.id])} />}
                <span className="haven-gallery-scrim" />
                <span className="haven-gallery-image-copy"><span className="haven-gallery-gold-line" /><span className="haven-gallery-image-title">{item.label}</span>{item.caption && <span className="haven-gallery-image-caption">{item.caption}</span>}</span>
                {!preview && <span className="haven-gallery-expand"><Expand size={16} aria-hidden="true" />View photo</span>}
              </button>;
            })}
            {filtered.length > 1 && <>
              <button type="button" className="haven-gallery-arrow haven-gallery-prev" aria-label="Previous gallery photo" onClick={() => step(-1)}><ChevronLeft size={26} strokeWidth={1.6} aria-hidden="true" /></button>
              <button type="button" className="haven-gallery-arrow haven-gallery-next" aria-label="Next gallery photo" onClick={() => step(1)}><ChevronRight size={26} strokeWidth={1.6} aria-hidden="true" /></button>
            </>}
          </div>
          <div className="haven-gallery-thumbnails" role="group" aria-label="Choose a photo">
            {thumbnails.map((item, index) => <button key={item.id} type="button" aria-label={`Show ${item.label}`} aria-pressed={item.id === current.id} onClick={() => setSelectedId(item.id)} style={{ "--thumbnail-delay": `${index * 70}ms` } as React.CSSProperties}>
              <Image src={item.photo.src} alt="" fill unoptimized={preview} sizes="(max-width:680px) 26vw, 14vw" draggable={false} /><span className="haven-gallery-thumbnail-label">{item.label}</span>
            </button>)}
          </div>
          <div className="haven-gallery-indicators" role="group" aria-label="Photo position">
            {thumbnails.map((item, index) => <button key={item.id} type="button" aria-label={`Go to photo ${thumbnailStart + index + 1}: ${item.label}`} aria-pressed={item.id === current.id} onClick={() => setSelectedId(item.id)}><span /></button>)}
          </div>
        </> : <div className="haven-gallery-empty"><Building2 size={32} strokeWidth={1.2} aria-hidden="true" /><h3>{photos.length ? `${category} photos are being updated.` : "Property photos are being updated."}</h3>{photos.length > 0 && <button type="button" onClick={() => chooseCategory("All Photos")}>Browse all photos <ArrowRight size={17} aria-hidden="true" /></button>}</div>}
      </div>
      <p className="haven-gallery-status" role="status">{current ? `${current.label}. Photo ${selected + 1} of ${filtered.length} in ${category}.` : `No ${category.toLowerCase()} photos available.`}</p>
    </div>
    {photos.length > 0 && <footer className="haven-gallery-footer">
      {!preview && <button ref={collectionTrigger} type="button" className="haven-gallery-cta" aria-haspopup="dialog" onClick={openCollection}>See full gallery <ArrowRight size={21} aria-hidden="true" /></button>}
      <span className="haven-gallery-count"><Grid2X2 size={15} aria-hidden="true" />{photos.length} photos</span>
    </footer>}
    {current && (current.photo.isIllustrative || current.photo.sourceUrl) && <details className="haven-gallery-credit"><summary>About this photo</summary><p>{current.photo.caption}{current.photo.author && ` · ${current.photo.author}`}{current.photo.license && ` · ${current.photo.license}`}{current.photo.sourceUrl && <> · <a href={current.photo.sourceUrl} target="_blank" rel="noopener noreferrer">Photo source</a></>}{current.photo.isIllustrative && ". Concept imagery for the fictional Haven Hotel."}</p></details>}
    {!preview && lightboxIndex >= 0 && <GalleryLightbox photos={photos} index={lightboxIndex} onChange={index => setLightboxId(photos[index].id)} onClose={() => setLightboxId(null)} />}
    {collectionOpen && <GalleryCollectionDialog photos={photos} onClose={closeCollection} />}
  </div>;
}

function GalleryCollectionDialog({ photos, onClose }: { photos: HotelGalleryPhoto[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return <dialog ref={dialogRef} className="haven-gallery-dialog" aria-labelledby={titleId} onClose={event => {
    if (!event.currentTarget.open) onClose();
  }}>
    <header className="haven-gallery-dialog-bar">
      <h2 id={titleId}>Inside Haven</h2>
      <button ref={closeRef} type="button" onClick={() => dialogRef.current?.close()}><X size={20} aria-hidden="true" />Close gallery</button>
    </header>
    <div className="haven-gallery-dialog-body"><HotelGalleryGrid photos={photos} inDialog /></div>
  </dialog>;
}

export function HotelGalleryGrid({ photos, inDialog = false }: { photos: HotelGalleryPhoto[]; inDialog?: boolean }) {
  const [category, setCategory] = useState<Category>("All Photos");
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const id = useId();
  const filtered = category === "All Photos" ? photos : photos.filter(item => item.categories.includes(category));
  const lightboxIndex = filtered.findIndex(item => item.id === lightboxId);
  const credited = filtered.filter(item => item.photo.isIllustrative || item.photo.sourceUrl);

  return <section className="haven-gallery haven-gallery-collection" aria-labelledby={inDialog ? undefined : `${id}-title`}>
    {!inDialog && <>
      <Link className="haven-gallery-back" href="/#gallery"><ChevronLeft size={18} aria-hidden="true" />Back to hotel</Link>
      <header className="haven-gallery-collection-heading"><h1 id={`${id}-title`}>Inside Haven</h1><p>Explore the spaces that shape your stay.</p></header>
    </>}
    <div className="haven-gallery-filters" role="group" aria-label="Photo categories">
      {(["All Photos", ...WEBSITE_GALLERY_CATEGORIES] as const).map(name => {
        const Icon = categoryIcons[name];
        return <button key={name} type="button" aria-pressed={category === name} aria-controls={`${id}-photos`} onClick={() => setCategory(name)}><Icon size={19} strokeWidth={1.5} aria-hidden="true" /><span>{name}</span></button>;
      })}
    </div>
    <p className="haven-gallery-collection-count" role="status">{filtered.length} {filtered.length === 1 ? "photo" : "photos"}{category !== "All Photos" && ` · ${category}`}</p>
    {filtered.length ? <ul id={`${id}-photos`} className="haven-gallery-grid" aria-label={`${category} collection`}>
      {filtered.map((item, index) => <li key={item.id}><figure>
        <button type="button" className="haven-gallery-grid-photo" aria-label={`View ${item.label} fullscreen`} onClick={() => setLightboxId(item.id)}>
          {failedIds.includes(item.id) ? <span className="haven-gallery-grid-error">Photo unavailable. Open photo to try again.</span> : <Image src={item.photo.src} alt={item.alt} fill loading={index < (inDialog ? 9 : 3) ? "eager" : undefined} sizes={inDialog ? "31vw" : "(max-width: 680px) 46vw, (max-width: 1000px) 47vw, 31vw"} style={{ objectPosition: item.photo.objectPosition }} onError={() => setFailedIds(ids => ids.includes(item.id) ? ids : [...ids, item.id])} />}
          <span className="haven-gallery-grid-expand"><Expand size={18} aria-hidden="true" /></span>
        </button>
        <figcaption>{item.label}</figcaption>
      </figure></li>)}
    </ul> : <div id={`${id}-photos`} className="haven-gallery-empty"><h2>{photos.length ? `${category} photos are being updated.` : "Property photos are being updated."}</h2>{photos.length > 0 && <button type="button" onClick={() => setCategory("All Photos")}>Browse all photos <ArrowRight size={17} aria-hidden="true" /></button>}</div>}
    {credited.length > 0 && <details className="haven-gallery-collection-credit"><summary>About these photos</summary><ul>{credited.map(item => <li key={item.id}><strong>{item.label}</strong><p>{item.photo.caption}{item.photo.author && ` · ${item.photo.author}`}{item.photo.license && ` · ${item.photo.license}`}{item.photo.sourceUrl && <> · <a href={item.photo.sourceUrl} target="_blank" rel="noopener noreferrer">Photo source</a></>}{item.photo.isIllustrative && ". Concept imagery for the fictional Haven Hotel."}</p></li>)}</ul></details>}
    {lightboxIndex >= 0 && <GalleryLightbox photos={filtered} index={lightboxIndex} onChange={index => setLightboxId(filtered[index].id)} onClose={() => setLightboxId(null)} />}
  </section>;
}

function GalleryLightbox({ photos, index, onChange, onClose }: { photos: HotelGalleryPhoto[]; index: number; onChange: (index: number) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDialogElement>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ index, onChange, onClose });
  useEffect(() => { latest.current = { index, onChange, onClose }; });
  const item = photos[index];

  function close() {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(() => latest.current.onClose(), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 260);
  }
  useEffect(() => {
    const dialog = rootRef.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    function keydown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current?.click(); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); latest.current.onChange(wrap(latest.current.index + (event.key === "ArrowRight" ? 1 : -1), photos.length)); }
      if (event.key === "Tab") {
        const controls = rootRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        event.stopPropagation();
      }
    }
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      if (dialog.open) dialog.close();
      document.body.style.overflow = priorOverflow;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [photos.length]);

  return createPortal(<dialog ref={rootRef} aria-label="Haven photo gallery" className={`haven-lightbox${closing ? " is-closing" : ""}`} onCancel={event => {
    event.preventDefault();
    close();
  }}>
    <header><span>Haven gallery</span><button ref={closeRef} type="button" aria-label="Close gallery" onClick={close}><X size={22} aria-hidden="true" /><span>Close</span></button></header>
    <div className="haven-lightbox-stage" onClick={event => { if (event.target === event.currentTarget) close(); }} onPointerDown={event => { if (event.pointerType !== "mouse") touch.current = { x: event.clientX, y: event.clientY }; }} onPointerCancel={() => { touch.current = null; }} onPointerUp={event => {
      const start = touch.current; touch.current = null;
      if (start && Math.abs(event.clientX - start.x) > 45 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.25) onChange(wrap(index + (event.clientX < start.x ? 1 : -1), photos.length));
    }}>
      {failedId === item.id ? <div className="haven-lightbox-error"><p>This photo couldn’t be loaded.</p><button type="button" onClick={() => setFailedId(null)}>Try again</button><p>Use the arrows to keep exploring.</p></div> : <Image key={item.id} src={item.photo.src} alt={item.alt} fill unoptimized sizes="100vw" draggable={false} onError={() => setFailedId(item.id)} />}
      {photos.length > 1 && <><button type="button" className="haven-lightbox-prev" aria-label="Previous fullscreen photo" onClick={() => onChange(wrap(index - 1, photos.length))}><ChevronLeft size={28} aria-hidden="true" /></button><button type="button" className="haven-lightbox-next" aria-label="Next fullscreen photo" onClick={() => onChange(wrap(index + 1, photos.length))}><ChevronRight size={28} aria-hidden="true" /></button></>}
    </div>
    <footer aria-live="polite"><div><h3>{item.label}</h3>{item.caption && <p>{item.caption}</p>}{item.photo.isIllustrative && <small>Illustrative hotel concept</small>}{item.photo.sourceUrl && <a href={item.photo.sourceUrl} target="_blank" rel="noopener noreferrer">{item.photo.author} · {item.photo.license} · Photo source</a>}</div><span>{String(index + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}</span></footer>
  </dialog>, document.body);
}
