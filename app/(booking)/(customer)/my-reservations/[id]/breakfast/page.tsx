import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireCustomerSession } from "@/lib/customer-auth";
import { breakfastDayLabel } from "@/lib/breakfast";
import { canShowBreakfastPass, getGuestBreakfast } from "@/lib/breakfast-server";
import { displayTime } from "@/lib/hotel-policy";
import "@/components/customer/breakfast-pass.css";

export default async function BreakfastPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const [session, { id }, { date }] = await Promise.all([requireCustomerSession(), params, searchParams]);
  const booking = await getGuestBreakfast(session.user.id, id).catch(() => undefined);
  if (booking === null) notFound();
  const stayUrl = `/my-reservations/${encodeURIComponent(id)}`;
  const meal = booking?.snapshot;
  const days = booking?.days ?? [];
  const stay = booking?.stay;
  const eligible = (day: (typeof days)[number]) => Boolean(meal && stay && day.used < day.allowance
    && canShowBreakfastPass(stay, day.service_date, meal.timezone, meal.end));
  const day = days.find(item => item.service_date === date) ?? days.find(eligible) ?? days.at(-1);
  const qr = day && eligible(day) ? await QRCode.toDataURL(day.pass_code, { width: 360, margin: 4 }) : null;
  return <main className="breakfast-page">
    <nav aria-label="Reservation navigation"><Link href="/my-reservations">My Reservations</Link> / <Link href={stayUrl}>Your stay</Link></nav>
    <article className="breakfast-ticket">
      <header className="breakfast-ticket-header"><h1>Breakfast pass</h1>{meal && <p>{meal.venue} · {displayTime(meal.start)} – {displayTime(meal.end)} hotel time</p>}</header>
      <div className="breakfast-ticket-body">
        {!booking ? <p>Breakfast passes are temporarily unavailable. Please refresh or contact Front Desk.</p> : !meal || !day ? <p>No breakfast pass is available for this reservation.</p> : <>
          <nav className="breakfast-day-nav" aria-label="Breakfast date">{days.map(item => <Link key={item.service_date} href={`${stayUrl}/breakfast?date=${item.service_date}`} aria-current={day.service_date === item.service_date ? "date" : undefined}>{breakfastDayLabel(item.service_date)}</Link>)}</nav>
          <section className="breakfast-day">
            <h2>{breakfastDayLabel(day.service_date)}</h2>
            <p>{stay?.room_number ? `Room ${stay.room_number} · ` : ""}Breakfast for {day.allowance} {day.allowance === 1 ? "guest" : "guests"}</p>
            <p>{day.used} of {day.allowance} used · {day.allowance - day.used} remaining</p>
            {qr ? <>
              <Image className="breakfast-qr" src={qr} alt={`Breakfast QR for ${breakfastDayLabel(day.service_date)}`} width={216} height={216} unoptimized />
              <div className="breakfast-download">
                <a className="btn" href={`/api/account/reservations/${encodeURIComponent(id)}/breakfast/${day.service_date}`} download>Download pass image</a>
                <p className="breakfast-help">Save the PNG or show this screen. This pass is valid only during breakfast service on the selected date. Staff check the current allowance when scanned.</p>
                <details><summary>Show pass code for manual entry</summary><p className="breakfast-help" style={{ overflowWrap: "anywhere" }}>{day.pass_code}</p></details>
              </div>
            </> : <p>{day.used >= day.allowance ? "All breakfasts for this date have been served." : "This pass is unavailable. If you need help, contact Front Desk."}</p>}
          </section>
        </>}
      </div>
    </article>
  </main>;
}
