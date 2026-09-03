import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Check, ShieldCheck, Sparkles, Users, Waves } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { BookingHeader } from "@/components/booking/booking-shell";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { RoomResults } from "@/components/booking/room-results";
import { getAvailability, hotelToday, searchSchema } from "@/lib/booking";
import "./search.css";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const session = await getServerSession(authOptions);
  const forwarded = new URLSearchParams();
  for (const key of ["checkIn", "checkOut", "guests", "expired", "changed"]) {
    const value = raw[key];
    if (typeof value === "string") forwarded.set(key, value);
  }
  if (session?.user.role === "guest") redirect(`/account/find-room${forwarded.size ? `?${forwarded}` : ""}`);
  const today = hotelToday();
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const input = {
    checkIn: String(raw.checkIn || today),
    checkOut: String(raw.checkOut || next.toISOString().slice(0, 10)),
    guests: Number(raw.guests) || 2,
  };
  const parsed = searchSchema.safeParse(input);
  let rooms: Awaited<ReturnType<typeof getAvailability>> = [];
  let availabilityError: string | undefined;
  if (parsed.success) {
    try {
      rooms = await getAvailability(parsed.data);
    } catch (error) {
      const code = error instanceof Error ? error.message.match(/\(([^)]+)\)$/)?.[1] : undefined;
      console.error("Availability lookup failed", { code: code ?? "unknown" });
      availabilityError = "Live availability is temporarily unavailable. Please try your search again.";
    }
  }
  const details = (roomType: string) => {
    const query = new URLSearchParams({ roomType, checkIn: input.checkIn, checkOut: input.checkOut, guests: String(input.guests) });
    const path = `/booking/details?${query}`;
    return session ? path : `/login?booking=1&callbackUrl=${encodeURIComponent(path)}`;
  };

  const nights = (() => {
    const a = new Date(input.checkIn);
    const b = new Date(input.checkOut);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    return diff > 0 ? diff : 1;
  })();

  return (
    <main className="booking-page">
      <BookingHeader step="Select your room · Step 1 of 3" />
      <section className="booking-hero--search" aria-label="Search hero">
        <span className="booking-hero__kicker">
          <Sparkles size={12} aria-hidden="true" /> Live inventory · Mactan Bay
        </span>
        <h1>
          Find your <em>perfect</em> room
        </h1>
        <p>Real-time availability, honest rates, and a calm booking flow — no surprises at checkout.</p>
      </section>

      <div className="booking-content--premium">
        {raw.expired && <p className="booking-notice">Your hold expired. Please pick from today’s live rooms.</p>}
        {raw.changed && <p className="booking-notice">Rates or availability changed — here are the latest results.</p>}

        <div className="booking-search-summary">
          <BookingSearchForm compact initial={input} />
          <div className="booking-active-filters" aria-label="Current search filters">
            <span className="booking-filter-chip">
              <CalendarDays size={13} aria-hidden="true" /> {input.checkIn} → {input.checkOut} · {nights} night{nights !== 1 ? "s" : ""}
            </span>
            <span className="booking-filter-chip">
              <Users size={13} aria-hidden="true" /> {input.guests} guest{input.guests !== 1 ? "s" : ""}
            </span>
            <span className="booking-filter-chip">
              <Waves size={13} aria-hidden="true" /> {rooms.length} {rooms.length === 1 ? "room" : "rooms"} available
            </span>
          </div>
        </div>

        <div className="booking-layout">
          <div className="booking-results">
            <div className="booking-results__head">
              <h2>{rooms.length ? "Rooms for your dates" : "Choose different dates"}</h2>
              <span className="booking-results__count">
                {parsed.success ? `${rooms.length} results` : "Check details"}
              </span>
            </div>
            {/* Premium results — RoomResults keeps hrefFor logic, we wrap it */}
            <RoomResults rooms={rooms} error={availabilityError ?? (parsed.success ? undefined : parsed.error.issues[0]?.message)} hrefFor={details} />
          </div>

          <aside className="booking-sidebar" aria-label="Booking help">
            <div className="booking-sidebar__card">
              <h3>Why book direct</h3>
              <ul className="booking-sidebar__list">
                <li>
                  <Check size={13} aria-hidden="true" /> Best rate guarantee
                </li>
                <li>
                  <Check size={13} aria-hidden="true" /> Pay at hotel · free changes*
                </li>
                <li>
                  <Check size={13} aria-hidden="true" /> 24h Front Desk support
                </li>
              </ul>
              <p style={{ marginTop: 10, fontSize: 10, color: "#8a9a94" }}>* Subject to your fare rules.</p>
            </div>
            <div className="booking-sidebar__card">
              <h3>Need help?</h3>
              <p>Seen a room you like? Hold it for 15 minutes while you decide.</p>
              <div className="booking-sidebar__note">
                <strong style={{ display: "block", marginBottom: 4, color: "#0f241e" }}>
                  <ShieldCheck size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />
                  Secure hold
                </strong>
                Hold is free — pay at hotel. We’ll confirm by email and keep your dates reserved.
              </div>
              <Link href="/#faq" className="btn btn-soft" style={{ marginTop: 12, borderRadius: 999, width: "100%", justifyContent: "center" }}>
                View FAQs
              </Link>
            </div>
            <div className="booking-sidebar__card">
              <h3>Your search</h3>
              <p>
                Check-in <strong>{input.checkIn}</strong> → Check-out <strong>{input.checkOut}</strong>
                <br />
                {nights} night{nights !== 1 ? "s" : ""} · {input.guests} guest{input.guests !== 1 ? "s" : ""}
              </p>
              <Link href="/#location" className="btn btn-soft" style={{ marginTop: 12, borderRadius: 999, width: "100%", justifyContent: "center" }}>
                Contact Front Desk <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
