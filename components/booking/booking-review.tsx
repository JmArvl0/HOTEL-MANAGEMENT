import Link from "next/link";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  PencilLine,
  ReceiptText,
  Tag,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { formatArrival } from "@/lib/arrival-time-options";
import { formatPeso } from "@/lib/format";
import type { NightlyRate } from "@/lib/rate-plans";
import { RoomPhotoTrigger } from "@/components/booking/room-photo-lightbox";

export type StayLine = { label: string; amount: number };

export function ReviewGuestCard({
  firstName,
  lastName,
  email,
  mobile,
  address,
  expectedArrival,
  requested,
  specialRequests,
  detailsHref,
}: {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  address?: string | null;
  expectedArrival?: string | null;
  requested: string[];
  specialRequests?: string | null;
  detailsHref: string;
}) {
  return (
    <section className="review-section review-guest-section" aria-labelledby="review-guest-heading">
      <header className="review-guest-head">
        <span className="review-guest-avatar" aria-hidden="true">
          <UserRound size={20} />
        </span>
        <div className="review-guest-titles">
          <p className="review-eyebrow">Guest profile</p>
          <h2 id="review-guest-heading">Guest details</h2>
          <p className="review-sub">Please review your information below before continuing.</p>
        </div>
        <Link className="review-edit-link" href={detailsHref}>
          <PencilLine size={13} aria-hidden="true" />
          Edit details
        </Link>
      </header>
      <div className="review-rows">
        <div className="review-row">
          <div className="review-desc">
            <span className="review-desc-icon" aria-hidden="true">
              <UserRound size={16} />
            </span>
            <div>
              <h3>Personal information</h3>
              <p>The name on this reservation will be used for check-in.</p>
            </div>
          </div>
          <dl className="review-values">
            <div className="review-field review-info-surface">
              <dt>Full name</dt>
              <dd>
                {firstName} {lastName}
              </dd>
            </div>
          </dl>
        </div>
        <div className="review-row">
          <div className="review-desc">
            <span className="review-desc-icon" aria-hidden="true">
              <Mail size={16} />
            </span>
            <div>
              <h3>Contact details</h3>
              <p>We&rsquo;ll use this to send your confirmation and updates.</p>
            </div>
          </div>
          <dl className="review-values review-values--2">
            <div className="review-field review-info-surface">
              <dt>Email address</dt>
              <dd className="review-email">{email}</dd>
            </div>
            <div className="review-field review-info-surface">
              <dt>Mobile number</dt>
              <dd>{mobile}</dd>
            </div>
          </dl>
        </div>
        <div className="review-row">
          <div className="review-desc">
            <span className="review-desc-icon" aria-hidden="true">
              <CalendarDays size={16} />
            </span>
            <div>
              <h3>Arrival details</h3>
              <p>Let us know when to expect you.</p>
            </div>
          </div>
          <dl className="review-values review-values--2">
            <div className="review-field review-info-surface">
              <dt>
                <MapPin size={11} aria-hidden="true" /> Address
              </dt>
              <dd>{address ? address : <span className="review-none">Not provided</span>}</dd>
            </div>
            <div className="review-field review-info-surface">
              <dt>Expected arrival</dt>
              <dd>{expectedArrival ? formatArrival(expectedArrival) : <span className="review-none">Not provided</span>}</dd>
            </div>
          </dl>
        </div>
        <div className="review-row">
          <div className="review-desc">
            <span className="review-desc-icon" aria-hidden="true">
              <BedDouble size={16} />
            </span>
            <div>
              <h3>Stay preparations</h3>
              <p>We&rsquo;ll have these ready for your stay.</p>
            </div>
          </div>
          <div className="review-values">
            {requested.length > 0 ? (
              <ul className="review-chips">
                {requested.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="review-none">No stay preparations selected.</p>
            )}
          </div>
        </div>
        <div className="review-row">
          <div className="review-desc">
            <span className="review-desc-icon" aria-hidden="true">
              <MessageSquare size={16} />
            </span>
            <div>
              <h3>Special request</h3>
              <p>Tell us if there&rsquo;s anything else we should know.</p>
            </div>
          </div>
          <div className="review-values">
            {specialRequests ? (
              <p className="review-request-surface">{specialRequests}</p>
            ) : (
              <p className="review-request-surface review-none">No additional request.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReviewDepositTiles({
  depositRequired,
  remainingBalance,
  depositLabel,
  remainingNote,
}: {
  depositRequired: number | string;
  remainingBalance: number | string;
  depositLabel: string;
  remainingNote: string;
}) {
  return (
    <section className="review-section" aria-labelledby="review-deposit-heading">
      <header className="review-section-heading">
        <h2 id="review-deposit-heading">Reservation deposit</h2>
      </header>
      <dl className="review-finance">
        <div className="review-finance--due">
          <dt>
            <CreditCard size={14} aria-hidden="true" /> Deposit due now
          </dt>
          <dd>{formatPeso(depositRequired)}</dd>
          <small>
            {depositLabel} of your stay total, required before this online reservation can be confirmed.
          </small>
        </div>
        <div className="review-finance--rest">
          <dt>
            <Wallet size={14} aria-hidden="true" /> Remaining balance
          </dt>
          <dd>{formatPeso(remainingBalance)}</dd>
          <small>{remainingNote}</small>
        </div>
      </dl>
    </section>
  );
}

export function ReviewStayCard({
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
}) {
  const varied = nightly && nightly.length > 0 && nightly.some((night) => night.rate !== nightly[0].rate);
  const photo = photos.length > 0 ? photos[0] : undefined;
  return (
    <aside className="review-stay-card" aria-label={`Your stay in the ${roomType}`}>
      <div className={`review-stay-photo${photo ? "" : " review-stay-photo--fallback"}`}>
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- DB photo URL, same rationale as the shared lightbox */}
            <img src={photo} alt="" aria-hidden="true" loading="lazy" />
            <RoomPhotoTrigger photos={photos} roomName={roomType} className="review-stay-photo-open" />
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
        </dl>
        <small>Taxes and service charges are currently included at ₱0 under the configured hotel policy.</small>
      </div>
    </aside>
  );
}
