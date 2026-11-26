import { CalendarDays, ChevronDown, UsersRound } from "lucide-react";
import { AvailabilityGuide } from "./availability-guide";
import { BookingSearchForm } from "./booking-search-form";
import "./stay-search-panel.css";

const dateRange = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

type SearchFormProps = React.ComponentProps<typeof BookingSearchForm>;

export function StaySearchPanel({
  className,
  searched,
  ...form
}: Pick<SearchFormProps, "action" | "initial" | "maxGuests" | "searched" | "timeZone" | "validation"> & { className?: string }) {
  return (
    <AvailabilityGuide className={className}>
      <details className="stay-search-panel" data-stay-editor open={form.validation ? true : undefined}>
        <summary>
          <CalendarDays size={19} aria-hidden="true" />
          <span className="stay-search-selection">
            <strong>{searched ? dateRange.formatRange(
              new Date(`${searched.checkIn}T00:00:00Z`),
              new Date(`${searched.checkOut}T00:00:00Z`),
            ) : "Choose stay dates"}</strong>
            {searched && <span><UsersRound size={14} aria-hidden="true" /> {searched.guests} {searched.guests === 1 ? "guest" : "guests"}</span>}
          </span>
          <span className="stay-search-edit">{searched ? "Edit stay" : "Add dates"} <ChevronDown size={16} aria-hidden="true" /></span>
        </summary>
        <div id="book-form" className="stay-search-fields">
          <BookingSearchForm {...form} compact searched={searched} />
        </div>
      </details>
    </AvailabilityGuide>
  );
}
