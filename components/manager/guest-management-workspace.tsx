"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ContactRound, Users } from "lucide-react";
import { GuestAvatar, GuestFlagBadges, GuestLoyalty, GuestProfileDetails, guestDate, type GuestProfile } from "./guest-profile";
import { useHotelResource } from "./hotel-operations-client";
import { HavenFilterBadges, HavenSearchInput, HavenSkeletonList } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { sortTableRows, TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { ALL_LOYALTY_TIERS, loyaltyTierOptions, matchesLoyaltyTier } from "@/lib/guest-loyalty";
import { filterStaffItems } from "@/lib/staff-search";
import type { GuestDirectory, GuestDirectoryRow } from "@/lib/guest-directory";
import type { Role } from "@/lib/types";

const queues = [
  { value: "all", label: "All guests", matches: () => true },
  { value: "in_house", label: "In house", matches: (row: GuestDirectoryRow) => row.inHouse },
  { value: "arriving", label: "Arriving today", matches: (row: GuestDirectoryRow) => row.arrivingToday },
  { value: "vip", label: "VIP", matches: (row: GuestDirectoryRow) => row.flags.includes("vip") },
];
const emptyRows: GuestDirectoryRow[] = [];

function stayStatus(row: GuestDirectoryRow) {
  if (row.inHouse) return { status: "checked_in", label: "In house", detail: row.currentRoom ? `Room ${row.currentRoom}` : "Room unassigned" };
  if (row.arrivingToday) return { status: "pending", label: "Arriving today", detail: row.nextRoom ? `Room ${row.nextRoom}` : "Room unassigned" };
  if (row.nextArrival) return { status: "scheduled", label: "Upcoming", detail: guestDate(row.nextArrival) };
  return { status: "not_active", label: "No active stay", detail: "" };
}

function ProfileRecord({ row, role, today, onViewReservation, onFlagsChanged }: {
  row: GuestDirectoryRow;
  role: Role;
  today: string;
  onViewReservation: (id: string) => void;
  onFlagsChanged: () => void;
}) {
  const { data, loading, error, refresh } = useHotelResource<GuestProfile>(`/api/staff/guests/${encodeURIComponent(row.guest.id)}`);
  const guest = data?.guest ?? row.guest;
  const name = String(guest.name || "Unnamed guest");
  return <>
    <header className="guest-profile-header">
      <p className="guest-profile-label"><ContactRound size={16} aria-hidden="true" /> Guest profile</p>
      <div className="guest-profile-identity">
        <GuestAvatar name={name} />
        <div><h2 tabIndex={-1} data-guest-profile-title>{name}</h2><p>{guest.id}</p></div>
      </div>
      <div className="guest-profile-badges"><GuestLoyalty guest={guest} /><GuestFlagBadges flags={row.flags} /></div>
    </header>
    {loading && <div className="guest-workspace-feedback"><HavenSkeletonList lines={3} /></div>}
    {error && <div className="guest-workspace-feedback" role="alert"><p>{error}</p>
      <button type="button" className="btn btn-soft" onClick={() => void refresh()}>Retry profile</button>
    </div>}
    {data && <GuestProfileDetails profile={data} role={role} today={today} onViewReservation={onViewReservation} onFlagsChanged={onFlagsChanged} />}
  </>;
}

export default function GuestManagementWorkspace({ role, search, setSearch, onViewReservation }: {
  role: Role;
  search: string;
  setSearch: (search: string) => void;
  onViewReservation: (id: string) => void;
}) {
  const { data, loading, error, refresh } = useHotelResource<GuestDirectory>("/api/staff/guests");
  const [queue, setQueue] = useState("all");
  const [tier, setTier] = useState(ALL_LOYALTY_TIERS);
  const [selectedId, setSelectedId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const rows = data?.rows ?? emptyRows;
  const activeQueue = queues.find(item => item.value === queue && (queue !== "vip" || data?.flagsAvailable)) ?? queues[0];
  const tiers = useMemo(() => loyaltyTierOptions(rows.map(row => row.guest)), [rows]);
  const activeTier = tiers.some(option => option.value === tier) ? tier : ALL_LOYALTY_TIERS;
  const filtered = useMemo(() => {
    const matching = new Set(filterStaffItems(rows.map(row => row.guest), search, "guests").map(guest => guest.id));
    const digits = /^\+?[\d\s().-]+$/.test(search.trim()) ? search.replace(/\D/g, "") : "";
    return sortTableRows(rows.filter(row => activeQueue.matches(row) && matchesLoyaltyTier(row.guest, activeTier) &&
      (matching.has(row.guest.id) || (digits && String(row.guest.phone ?? "").replace(/\D/g, "").includes(digits)))),
    row => String(row.guest.name ?? row.guest.id));
  }, [rows, search, activeQueue, activeTier]);
  const page = useTablePagination(filtered);
  const selected = page.rows.find(row => row.guest.id === selectedId) ?? page.rows[0];
  const activeFilters = search.trim() || activeTier !== ALL_LOYALTY_TIERS || activeQueue.value !== "all";

  function selectProfile(id: string, button: HTMLButtonElement | null) {
    trigger.current = button;
    setSelectedId(id);
    setProfileOpen(true);
    requestAnimationFrame(() => {
      if (!backButton.current?.getClientRects().length) return;
      workspace.current?.scrollIntoView({ block: "start" });
      workspace.current?.querySelector<HTMLElement>("[data-guest-profile-title]")?.focus({ preventScroll: true });
    });
  }

  function backToDirectory() {
    setProfileOpen(false);
    requestAnimationFrame(() => {
      const target = trigger.current?.isConnected ? trigger.current : workspace.current?.querySelector<HTMLInputElement>("input[type=search]");
      target?.focus();
    });
  }

  return <div className="guest-management" ref={workspace}>
    <header className="guest-management-heading">
      <h1>Guest Management</h1>
      <p>Find a guest and see what matters for their stay.</p>
    </header>
    <div className="guest-management-grid" data-profile-open={profileOpen && Boolean(selected)}>
      <section className="guest-directory" aria-labelledby="guest-directory-heading">
        <header className="guest-directory-header">
          <div><h2 id="guest-directory-heading">Guest directory</h2><p>Select a guest to see their profile.</p></div>
          <Users size={22} aria-hidden="true" />
        </header>
        <div className="guest-directory-filters">
          <HavenFilterBadges label="Guest quick filters" value={activeQueue.value}
            onChange={value => { setQueue(value); page.setPage(1); }}
            options={queues.filter(item => item.value !== "vip" || data?.flagsAvailable).map(item => ({
              value: item.value, label: item.label, count: data ? rows.filter(item.matches).length : undefined,
            }))} />
          <div className="guest-directory-controls">
            <HavenSearchInput value={search} label="Search guests" placeholder="Name, email, phone or guest ID"
              onValueChange={value => { setSearch(value); page.setPage(1); }} debounceMs={0} />
            <HavenSelect value={activeTier} ariaLabel="Filter by loyalty tier" options={tiers}
              onChange={value => { setTier(value); page.setPage(1); }} />
          </div>
        </div>
        {error && <div className="guest-workspace-feedback" role="alert"><p>{data ? "Could not refresh the directory. Showing the last loaded results." : error}</p>
          <button type="button" className="btn btn-soft" onClick={() => void refresh()}>Retry directory</button>
        </div>}
        <div className="guest-directory-list">
          {loading && !data && <div className="guest-workspace-feedback"><HavenSkeletonList lines={5} /></div>}
          {data && <table aria-label="Guests">
            <thead><tr><th scope="col">Guest</th><th scope="col" className="guest-tier-col">Loyalty</th>
              <th scope="col">Stay status</th><th scope="col" className="guest-last-col">Last checkout</th></tr></thead>
            <tbody>{page.rows.map(row => {
              const { guest } = row;
              const name = String(guest.name || "Unnamed guest");
              const stay = stayStatus(row);
              const isSelected = guest.id === selected?.guest.id;
              return <tr key={guest.id} data-selected={isSelected}
                onClick={event => selectProfile(guest.id, event.currentTarget.querySelector("button"))}>
                <td><button type="button" className="guest-directory-person" aria-current={isSelected ? "true" : undefined}>
                  <GuestAvatar name={name} />
                  <span><span className="guest-directory-name"><strong>{name}</strong><GuestFlagBadges flags={row.flags} /></span>
                    <small className="guest-directory-email">{guest.email || guest.id}</small>
                    <small className="guest-directory-id">{guest.id}</small>
                  </span>
                </button></td>
                <td className="guest-tier-col"><GuestLoyalty guest={guest} /></td>
                <td><StatusBadge status={stay.status} label={stay.label} showIcon={false} />{stay.detail && <small>{stay.detail}</small>}</td>
                <td className="guest-last-col">{guestDate(row.lastCheckout)}</td>
              </tr>;
            })}</tbody>
          </table>}
          {data && page.total === 0 && <div className="guest-workspace-feedback guest-directory-empty">
            <h3>{activeFilters ? "No guests match these filters" : "No guest records"}</h3>
            {activeFilters && <p>Try another search or clear the filters.</p>}
          </div>}
        </div>
        {data && <footer className="guest-directory-footer">
          <TablePagination {...page} onPageChange={page.setPage} noun="guests" allTotal={rows.length} />
          {activeFilters && <button type="button" className="btn btn-soft" onClick={() => {
            setSearch(""); setQueue("all"); setTier(ALL_LOYALTY_TIERS); page.setPage(1);
          }}>Clear filters</button>}
        </footer>}
      </section>
      <aside className="guest-profile-rail" aria-label="Guest profile">
        <button ref={backButton} type="button" className="btn btn-soft guest-back" onClick={backToDirectory}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to directory
        </button>
        {data && selected ? <ProfileRecord key={selected.guest.id} row={selected} role={role} today={data.today}
          onViewReservation={onViewReservation} onFlagsChanged={() => void refresh()} /> : <div className="guest-workspace-feedback guest-profile-empty">
          <ContactRound size={25} aria-hidden="true" /><h2>Guest profile</h2>
          <p>Select a guest from the directory to view their profile.</p>
        </div>}
      </aside>
    </div>
  </div>;
}
