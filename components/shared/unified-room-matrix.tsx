"use client";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";
import type { RecordItem } from "@/lib/types";

const text = (value: unknown) => String(value ?? " ").replaceAll("_", " ");
const money = (value: unknown) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));

// Room status is updated through the dedicated departmental workflows.
export default function UnifiedRoomMatrix({ items, onView }: {
  items: RecordItem[];
  onView: (item: RecordItem) => void;
}) {
  return (
    <div className="data-panel">
      <div className="room-card-grid" aria-label="Rooms records">
        {items.map((item) => (
          <article
            key={item.id} className={`room-card ${String(item.status)}`} role="button" tabIndex={0}
            aria-label={`View room details for Room ${text(item.number)}`}
            onClick={() => onView(item)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onView(item); } }}
          >
            <header>
              <b>Room {text(item.number)}</b>
              <StatusBadge status={String(item.status)} label={text(item.status)} />
            </header>
            <RoomTypeBadge name={text(item.type)} colorKey={item.room_type_color == null ? null : String(item.room_type_color)} />
            <dl>
              <div><dt>Floor</dt><dd>{text(item.floor)}</dd></div>
              {item.rate != null && <div><dt>Rate</dt><dd>{money(item.rate)}</dd></div>}
              <div>
                <dt>Housekeeping</dt>
                <dd><StatusBadge status={String(item.housekeeping)} label={text(item.housekeeping)} /></dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {items.length === 0 && (
        <div className="empty">
          <Search />
          <h3>No records found</h3>
          <p>No matching operational records are available.</p>
        </div>
      )}
      <div className="table-footer">
        Showing {items.length} record{items.length !== 1 ? "s" : ""}
        <span>Room readiness is saved to the shared hotel database.</span>
      </div>
    </div>
  );
}
