"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, Check, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatPeso } from "@/lib/format";
import { roomPhotos } from "@/lib/room-images";
import type { AvailableRoomType } from "@/lib/booking";

/** "View details" trigger + room-info overlay, shared by every RoomResults card. */
export function RoomDetailsButton({ room, bookHref }: { room: AvailableRoomType; bookHref: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(0);
  const [errored, setErrored] = useState<ReadonlySet<string>>(new Set());

  const photos = roomPhotos(room.name);
  // Drop photos that failed to load; show the first remaining one.
  const live = photos.map((url, i) => (errored.has(url) ? -1 : i)).filter((i) => i !== -1);
  const shownPos = Math.min(pos, live.length - 1);
  const src = live.length ? photos[live[shownPos]] : undefined;

  const onImgError = () => {
    if (!src) return;
    setErrored((prev) => new Set(prev).add(src));
  };
  const step = (delta: number) => {
    if (live.length < 2) return;
    setPos((p) => (p + delta + live.length) % live.length);
  };

  const facts: ReactNode = (
    <ul className="rd-facts">
      <li><Users size={14} aria-hidden="true" /> Up to {room.maxGuests} guest{room.maxGuests !== 1 ? "s" : ""}</li>
      <li><BedDouble size={14} aria-hidden="true" /> {room.beds}</li>
      {room.sizeSqm ? <li>{room.sizeSqm} m²</li> : null}
    </ul>
  );

  const footer = (
    <>
      <span className="rd-foot-rate">
        <small>Estimated stay total</small>
        <strong>{formatPeso(room.subtotal)}</strong>
      </span>
      <Link href={bookHref} className="btn btn-accent" onClick={() => setOpen(false)}>
        Book this room <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <>
      <button type="button" className="btn btn-soft" onClick={() => setOpen(true)}>
        View details
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={room.name}
        description={`Rooms & suites · ${room.nights} night${room.nights !== 1 ? "s" : ""} · up to ${room.maxGuests} guest${room.maxGuests !== 1 ? "s" : ""}`}
        size="full"
        className="room-details-modal"
        footer={footer}
      >
        <div className="rd-gallery">
          {src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>: CDN photos bypass the Next optimizer so they can't fail on allowlist/restart */}
              <img className="rd-photo" src={src} alt={`${room.name} — room photo ${shownPos + 1} of ${live.length}`} onError={onImgError} loading="eager" />
              {live.length > 1 && (
                <>
                  <button type="button" className="rd-arrow rd-arrow--prev" aria-label="Previous photo" onClick={() => step(-1)}>
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="rd-arrow rd-arrow--next" aria-label="Next photo" onClick={() => step(1)}>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  <span className="rd-count">{shownPos + 1} / {live.length}</span>
                </>
              )}
            </>
          ) : (
            <div className="rd-gallery-fallback">{room.name}</div>
          )}
        </div>
        {live.length > 1 && (
          <div className="rd-thumbs">
            {live.map((photoIndex, thumb) => (
              <button
                key={photos[photoIndex]}
                type="button"
                className={`rd-thumb${thumb === shownPos ? " is-active" : ""}`}
                aria-label={`View photo ${thumb + 1} of ${room.name}`}
                onClick={() => setPos(thumb)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos[photoIndex]} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {facts}
        <p className="rd-note">{room.availableUnits} room{room.availableUnits !== 1 ? "s" : ""} available for your dates</p>
        <p className="rd-description">{room.description}</p>
        <h3 className="rd-heading">What this room includes</h3>
        <ul className="rd-amenities">
          {room.amenities.map((amenity) => (
            <li key={amenity}><Check size={13} aria-hidden="true" /> {amenity}</li>
          ))}
        </ul>
        <div className="rd-rate">
          <strong>{formatPeso(room.nightlyRate)}</strong>
          <small>per night · {room.nights} night{room.nights !== 1 ? "s" : ""} = {formatPeso(room.subtotal)}</small>
        </div>
      </Modal>
    </>
  );
}
