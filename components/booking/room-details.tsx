"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, Check, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatPeso } from "@/lib/format";
import { roomPhotosFor } from "@/lib/room-images";
import type { AvailableRoomType, RoomTypeSummary } from "@/lib/booking";

/** Shared room-type presentation: photo carousel, facts, description, amenities.
 *  Used by the guest "View details" overlay and the staff catalog preview.
 *  Summary rooms (no `availableUnits`) show catalog copy instead of date-dependent notes. */
export function RoomTypeDetailsBody({ room, note, rateLine }: { room: AvailableRoomType | RoomTypeSummary; note?: ReactNode; rateLine?: ReactNode }) {
  const [pos, setPos] = useState(0);
  const [errored, setErrored] = useState<ReadonlySet<string>>(new Set());

  const photos = roomPhotosFor(room.photos, room.name);
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

  return (
    <>
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
      <ul className="rd-facts">
        <li><Users size={14} aria-hidden="true" /> Up to {room.maxGuests} guest{room.maxGuests !== 1 ? "s" : ""}</li>
        <li><BedDouble size={14} aria-hidden="true" /> {room.beds}</li>
        {room.sizeSqm ? <li>{room.sizeSqm} m²</li> : null}
      </ul>
      {note !== undefined ? note : <p className="rd-note">{"availableUnits" in room ? `${room.availableUnits} room${room.availableUnits !== 1 ? "s" : ""} available for your dates` : "Choose your dates to see live availability"}</p>}
      <p className="rd-description">{room.description}</p>
      <h3 className="rd-heading">What this room includes</h3>
      <ul className="rd-amenities">
        {room.amenities.map((amenity) => (
          <li key={amenity}><Check size={13} aria-hidden="true" /> {amenity}</li>
        ))}
      </ul>
      {rateLine !== undefined ? rateLine : (
        <div className="rd-rate">
          <strong>{formatPeso(room.nightlyRate)}</strong>
          <small>{"availableUnits" in room ? `per night · ${room.nights} night${room.nights !== 1 ? "s" : ""} = ${formatPeso(room.subtotal)}` : "per night · choose dates for your total"}</small>
        </div>
      )}
    </>
  );
}

/** "View details" trigger + room-info overlay, shared by every RoomResults card. */
export function RoomDetailsButton({ room, bookHref }: { room: AvailableRoomType | RoomTypeSummary; bookHref: string }) {
  const [open, setOpen] = useState(false);
  const priced = "availableUnits" in room;

  const footer = (
    <>
      <span className="rd-foot-rate">
        <small>{priced ? "Estimated stay total" : "Nightly base rate"}</small>
        <strong>{formatPeso(priced ? room.subtotal : room.nightlyRate)}</strong>
      </span>
      <Link href={bookHref} className="btn btn-accent" onClick={() => setOpen(false)}>
        {priced ? "Book this room" : "Choose your dates"} <ArrowRight size={16} aria-hidden="true" />
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
        description={`Rooms & suites · ${priced ? `${room.nights} night${room.nights !== 1 ? "s" : ""} · ` : ""}up to ${room.maxGuests} guest${room.maxGuests !== 1 ? "s" : ""}`}
        size="full"
        headerVariant="branded"
        className="room-details-modal"
        footer={footer}
        portal
      >
        <RoomTypeDetailsBody room={room} />
      </Modal>
    </>
  );
}
