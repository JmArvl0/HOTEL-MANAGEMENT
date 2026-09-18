import type { ReactNode } from "react";
import { CreditCard, LogIn, LogOut, Moon, ReceiptText, Tag, Users, Wallet } from "lucide-react";
import { formatPeso } from "@/lib/format";
import { roomPhotosFor } from "@/lib/room-images";
import type { NightlyRate } from "@/lib/rate-plans";
import { RoomPhotoTrigger } from "@/components/booking/room-photo-lightbox";

export type StayLine = { label: string; amount: number };

/** Shared customer booking stay-summary card (authoritative: Booking Review visual).
 *  Presentation only — every figure is passed in from the page's existing
 *  authoritative data (availability selection, hold, or reservation snapshot).
 *  Nothing here fetches, recalculates nights/rates/totals/deposits, or reads policy.
 *  Used by Guest Details, Review, Reservation Deposit (via depositDue +
 *  remainingBalance), and Confirmation. */
export function BookingStaySummary({
  roomType,
  checkIn,
  checkOut,
  guests,
  nights,
  rate,
  total,
  lines,
  nightly,
  photos,
  depositDue,
  remainingBalance,
  footnote,
}: {
  roomType: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  rate: number | null;
  total: number;
  lines?: StayLine[];
  nightly?: NightlyRate[];
  photos: string[];
  depositDue?: { label: string; amount: number };
  remainingBalance?: number;
  footnote?: ReactNode;
}) {
  const varied = nightly && nightly.length > 0 && nightly.some((night) => night.rate !== nightly[0].rate);
  // Authoritative gallery: DB photo_urls order (first = cover) with the
  // verified stock map as fallback — the same resolver Find a Room uses, so
  // the card always shows the same image. HAVEN fallback only when neither
  // source has a usable photo.
  const gallery = roomPhotosFor(photos.filter((url) => url.trim() !== ""), roomType);
  const photo = gallery.length > 0 ? gallery[0] : undefined;
  return (
    <aside className="review-stay-card" aria-label={`Your stay in the ${roomType}`}>
      <div className={`review-stay-photo${photo ? "" : " review-stay-photo--fallback"}`}>
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- DB photo URL, same rationale as the shared lightbox */}
            <img src={photo} alt="" aria-hidden="true" loading="lazy" />
            <RoomPhotoTrigger photos={gallery} roomName={roomType} className="review-stay-photo-open" />
          </>
        ) : (
          <span className="review-stay-fallback-mark" aria-hidden="true">
            Haven
          </span>
        )}
      </div>
      <div className="review-stay-body">
        <p className="review-stay-eyebrow">Your stay</p>
        <h2>{roomType}</h2>
        <dl>
          <div>
            <dt>
              <LogIn size={14} aria-hidden="true" /> Check-in
            </dt>
            <dd>{checkIn}</dd>
          </div>
          <div>
            <dt>
              <LogOut size={14} aria-hidden="true" /> Check-out
            </dt>
            <dd>{checkOut}</dd>
          </div>
          <div>
            <dt>
              <Users size={14} aria-hidden="true" /> Guests
            </dt>
            <dd>{guests}</dd>
          </div>
          <div>
            <dt>
              <Moon size={14} aria-hidden="true" /> Nights
            </dt>
            <dd>{nights}</dd>
          </div>
          {varied
            ? nightly!.map((night) => (
                <div key={night.date}>
                  <dt>
                    <Tag size={14} aria-hidden="true" /> {night.date}
                  </dt>
                  <dd>{formatPeso(night.rate)}</dd>
                </div>
              ))
            : rate != null && (
                <div>
                  <dt>
                    <Tag size={14} aria-hidden="true" /> Nightly rate
                  </dt>
                  <dd>{formatPeso(rate)}</dd>
                </div>
              )}
          {(lines ?? []).map((line) => (
            <div key={line.label}>
              <dt>
                <ReceiptText size={14} aria-hidden="true" /> {line.label}
              </dt>
              <dd>{formatPeso(line.amount)}</dd>
            </div>
          ))}
          <div className="review-stay-total">
            <dt>Stay total</dt>
            <dd>{formatPeso(total)}</dd>
          </div>
          {depositDue && (
            <div className="review-stay-deposit">
              <dt>
                <CreditCard size={14} aria-hidden="true" /> {depositDue.label}
              </dt>
              <dd>{formatPeso(depositDue.amount)}</dd>
            </div>
          )}
          {remainingBalance != null && (
            <div>
              <dt>
                <Wallet size={14} aria-hidden="true" /> Remaining balance
              </dt>
              <dd>{formatPeso(remainingBalance)}</dd>
            </div>
          )}
        </dl>
        <small>Taxes and service charges are currently included at ₱0 under the configured hotel policy.</small>
        {footnote && <div className="review-stay-footnote">{footnote}</div>}
      </div>
    </aside>
  );
}
