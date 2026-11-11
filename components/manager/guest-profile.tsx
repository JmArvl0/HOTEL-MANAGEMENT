"use client";

import { useId, useState } from "react";
import { ArrowUpRight, BedDouble, Bookmark, ContactRound } from "lucide-react";
import GuestFlagsPanel from "@/components/manager/guest-flags-panel";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { hotelToday } from "@/lib/booking";
import { guestFlagBadges, guestStayContext } from "@/lib/guest-directory";
import { guestLoyaltyKey, NO_LOYALTY_TIER, NO_LOYALTY_TIER_LABEL } from "@/lib/guest-loyalty";
import { requestLabel } from "@/lib/request-options";
import type { RecordItem, Role } from "@/lib/types";
import "./guest-management.css";

export type GuestProfile = {
  guest: RecordItem;
  stays: RecordItem[];
  stayCounts: { current: number; upcoming: number; completed: number; cancelled: number; noShow: number };
  mergedAliases?: RecordItem[];
  partyHistory?: RecordItem[];
  requestOptions: string[];
  requests: RecordItem[];
  transportation: RecordItem[];
  assignments: RecordItem[];
  approvals: RecordItem[];
  financial: { billed: number; paid: number; outstanding: number } | null;
  financialVisible: boolean;
};

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function guestDate(value: RecordItem[string]) {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : day.format(date);
}

export function GuestAvatar({ name }: { name: string }) {
  return <span className="guest-avatar" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>;
}

export function GuestLoyalty({ guest }: { guest: RecordItem }) {
  const tier = guestLoyaltyKey(guest);
  return <span className="guest-loyalty" data-tier={tier.toLowerCase()}>{tier === NO_LOYALTY_TIER ? NO_LOYALTY_TIER_LABEL : tier}</span>;
}

export function GuestFlagBadges({ flags }: { flags: string[] }) {
  return <>{guestFlagBadges.filter(flag => flags.includes(flag.type)).map(flag =>
    <span key={flag.type} className="guest-flag" data-tone={flag.status}>{flag.label}</span>
  )}</>;
}

const tabs = ["Overview", "Stays", "Guest flags"] as const;
type ProfileTab = (typeof tabs)[number];
const openStay = (stay: RecordItem) => ["pending", "confirmed", "checked_in"].includes(String(stay.status));

export function GuestProfileDetails({ profile, role, today, onViewReservation, onFlagsChanged }: {
  profile: GuestProfile;
  role: Role;
  today: string;
  onViewReservation: (id: string) => void;
  onFlagsChanged?: () => void;
}) {
  const [tab, setTab] = useState<ProfileTab>("Overview");
  const id = useId();
  const { guest, stays, stayCounts, partyHistory = [], mergedAliases = [], financial } = profile;
  const { current, next } = guestStayContext(stays, today);
  const featured = current ?? next;
  const arrivingToday = String(next?.check_in).slice(0, 10) === today;
  const identity = (featured ?? stays.find(stay => stay.identity_status))?.identity_status ?? "unverified";
  const active = stays.filter(openStay);
  const past = stays.filter(stay => !openStay(stay)).slice(0, 10);
  const sections = ["front_desk", "manager", "owner"].includes(role) ? tabs : tabs.slice(0, 2);
  const service = [
    ...profile.requests.slice(0, 12).map(request => ({ id: request.id, status: request.status, kind: "Request", text: `${label(request.department)} · ${label(request.request)}` })),
    ...profile.transportation.map(trip => ({ id: trip.id, status: trip.status, kind: "Transport", text: `${label(trip.service_type)} · ${guestDate(trip.pickup_date)}${trip.pickup_time ? ` ${label(trip.pickup_time)}` : ""}` })),
    ...profile.assignments.filter(entry => entry.released_at || entry.status !== "active").slice(0, 8).map(entry => ({ id: entry.id, status: entry.status, kind: "Room change", text: `${label(entry.reason || "Room assignment")} · ${guestDate(entry.check_in)} – ${guestDate(entry.check_out)}${entry.is_upgrade ? " · Upgrade" : ""}` })),
    ...profile.approvals.slice(0, 8).map(request => ({ id: request.id, status: request.status, kind: "Approval", text: `${label(request.request_type)} · ${label(request.reason)}` })),
  ];
  const reservationButton = (stay: RecordItem) => <button type="button" className="btn btn-soft"
    aria-label={`Open booking ${stay.confirmation_number ?? stay.id}`} onClick={() => onViewReservation(stay.id)}>
    Open booking <ArrowUpRight size={14} aria-hidden="true" />
  </button>;
  const stayList = (records: RecordItem[], showLink: boolean) => <ul className="guest-history-list">
    {records.map(stay => <li key={stay.id}>
      <div className="guest-profile-line"><strong>{stay.confirmation_number ?? stay.id}</strong>
        <StatusBadge status={String(stay.status)} label={label(stay.status)} showIcon={false} /></div>
      <p>{guestDate(stay.check_in)} – {guestDate(stay.check_out)} · {label(stay.room_type)}
        {stay.room_number ? ` · Room ${stay.room_number}` : ""}{stay.party_role ? ` · ${label(stay.party_role)}` : ""}
        {stay.guests ? ` · ${stay.guests} ${Number(stay.guests) === 1 ? "guest" : "guests"}` : ""}</p>
      {showLink && reservationButton(stay)}
    </li>)}
  </ul>;

  return <div className="guest-profile-content">
    <div className="guest-profile-tabs" role="tablist" aria-label="Guest profile sections"
      onKeyDown={event => {
        const currentIndex = sections.indexOf(tab);
        const keys: Record<string, number> = { ArrowLeft: (currentIndex + sections.length - 1) % sections.length,
          ArrowRight: (currentIndex + 1) % sections.length, Home: 0, End: sections.length - 1 };
        if (!Object.hasOwn(keys, event.key)) return;
        event.preventDefault();
        const index = keys[event.key];
        setTab(sections[index]);
        event.currentTarget.querySelectorAll("button")[index]?.focus();
      }}>
      {sections.map((section, index) => <button type="button" role="tab" key={section} id={`${id}-tab-${index}`}
        aria-selected={tab === section} aria-controls={`${id}-panel`} tabIndex={tab === section ? 0 : -1}
        onClick={() => setTab(section)}>{section}</button>)}
    </div>
    <div className="guest-profile-scroll" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${sections.indexOf(tab)}`} tabIndex={0}>
      {tab === "Overview" && <>
        <section className="guest-profile-stay">
          <div className="guest-profile-line">
            <h3><BedDouble size={16} aria-hidden="true" />{current ? "Current stay" : next ? "Next stay" : "Stay at a glance"}</h3>
            {featured && <StatusBadge status={current ? "checked_in" : arrivingToday ? "pending" : "scheduled"}
              label={current ? "In house" : arrivingToday ? "Arriving today" : "Upcoming"} showIcon={false} />}
          </div>
          {featured ? <>
            <strong>{featured.room_number ? `Room ${featured.room_number}` : "Room unassigned"}</strong>
            <p>{label(featured.room_type)} · {guestDate(featured.check_in)} – {guestDate(featured.check_out)}</p>
            <div className="guest-profile-line"><span>{featured.confirmation_number ?? featured.id}</span>{reservationButton(featured)}</div>
          </> : <p>No current or upcoming stay.</p>}
        </section>
        <section className="guest-profile-section">
          <h3><Bookmark size={16} aria-hidden="true" /> Saved preferences</h3>
          {guest.preferences && <p>{label(guest.preferences)}</p>}
          {guest.special_requests && <p><strong>Special requests</strong> {label(guest.special_requests)}</p>}
          {profile.requestOptions.length > 0 && <ul className="guest-preference-list" aria-label="Requested across bookings">
            {profile.requestOptions.map(option => <li key={option}>{requestLabel(option)}</li>)}
          </ul>}
          {!guest.preferences && !guest.special_requests && !profile.requestOptions.length && <p>No saved preferences on record.</p>}
        </section>
        <section className="guest-profile-section">
          <h3><ContactRound size={16} aria-hidden="true" /> Contact &amp; identity</h3>
          <dl className="guest-profile-fields">
            <div><dt>Email</dt><dd>{guest.email || "Not provided"}</dd></div>
            <div><dt>Phone</dt><dd>{guest.phone || "Not provided"}</dd></div>
            <div><dt>ID verification</dt><dd><StatusBadge status={String(identity)} showIcon={false} /></dd></div>
            <div><dt>Loyalty points</dt><dd>{Number(guest.loyalty_points ?? 0).toLocaleString("en-PH")}</dd></div>
            {guest.created_at && <div><dt>Guest since</dt><dd>{guestDate(guest.created_at)}</dd></div>}
            {guest.nationality && <div><dt>Nationality</dt><dd>{guest.nationality}</dd></div>}
            {guest.address && <div><dt>Address</dt><dd>{guest.address}</dd></div>}
          </dl>
        </section>
        {mergedAliases.length > 0 && <section className="guest-profile-section">
          <h3>Historical search aliases</h3><p>These identifiers help locate earlier records.</p>
          <dl className="guest-profile-fields">{mergedAliases.map((alias, index) => <div key={`${alias.id}-${index}`}><dt>{label(alias.type)}</dt><dd>{label(alias.value)}</dd></div>)}</dl>
        </section>}
        {profile.financialVisible && financial && <section className="guest-profile-section">
          <h3>Financial summary</h3>
          <dl className="guest-profile-fields"><div><dt>Total billed</dt><dd>{peso.format(financial.billed)}</dd></div>
            <div><dt>Total paid</dt><dd>{peso.format(financial.paid)}</dd></div>
            <div><dt>Outstanding balance</dt><dd>{peso.format(financial.outstanding)}</dd></div></dl>
        </section>}
      </>}
      {tab === "Stays" && <>
        <section className="guest-profile-section">
          <h3>Stay history</h3>
          <p>{stayCounts.current} current · {stayCounts.upcoming} upcoming · {stayCounts.completed} completed · {stayCounts.cancelled} cancelled · {stayCounts.noShow} no-show</p>
          {!stays.length && !partyHistory.length && <p>No reservations on record.</p>}
        </section>
        {active.length > 0 && <section className="guest-profile-section"><h3>Current &amp; upcoming stays</h3>{stayList(active, true)}</section>}
        {past.length > 0 && <section className="guest-profile-section"><h3>Past stays</h3>{stayList(past, false)}</section>}
        {partyHistory.length > 0 && <section className="guest-profile-section"><h3>Accompanying stays</h3>
          <p>Accompanying stays have separate booking ownership and financial responsibility.</p>{stayList(partyHistory, true)}</section>}
        {service.length > 0 && <section className="guest-profile-section"><h3>Service history</h3>
          <ul className="guest-history-list">{service.map(entry => <li key={`${entry.kind}-${entry.id}`}>
            <div className="guest-profile-line"><strong>{entry.kind}</strong><StatusBadge status={String(entry.status)} label={label(entry.status)} showIcon={false} /></div>
            <p>{entry.text}</p>
          </li>)}</ul>
        </section>}
      </>}
      {tab === "Guest flags" && <GuestFlagsPanel guestId={guest.id} role={role} onChanged={onFlagsChanged} />}
    </div>
  </div>;
}

export function GuestProfileModal({ profile, role, close, onViewReservation }: {
  profile: GuestProfile; role: Role; close: () => void; onViewReservation: (id: string) => void;
}) {
  return <Modal isOpen onClose={close} title={label(profile.guest.name)} size="lg" headerVariant="branded"
    description={`Guest profile · ${profile.guest.id} · ${label(profile.guest.loyalty_tier || NO_LOYALTY_TIER_LABEL)}`}
    footer={<button className="btn btn-soft" onClick={close}>Close</button>}>
    <GuestProfileDetails key={profile.guest.id} profile={profile} role={role} today={hotelToday()} onViewReservation={onViewReservation} />
  </Modal>;
}
