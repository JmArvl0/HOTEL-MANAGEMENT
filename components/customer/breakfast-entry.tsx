import Link from "next/link";
import { parseBreakfast } from "@/lib/breakfast";
import "./breakfast-pass.css";

export function BreakfastEntry({ id, snapshot, status }: { id: string; snapshot: unknown; status: string }) {
  const meal = parseBreakfast(snapshot);
  if (!meal) return null;
  const available = ["confirmed", "checked_in", "checked_out"].includes(status);
  return <section className="breakfast-entry" aria-label="Breakfast included with your stay">
    <h2>Breakfast at {meal.venue}</h2>
    <p>{meal.guests} {meal.guests === 1 ? "guest" : "guests"} · {meal.mornings} {meal.mornings === 1 ? "morning" : "mornings"}{status === "pending" ? " · Passes unlock when your stay is confirmed" : ""}</p>
    {available && <Link className="btn" href={`/my-reservations/${encodeURIComponent(id)}/breakfast`}>View breakfast pass</Link>}
  </section>;
}
