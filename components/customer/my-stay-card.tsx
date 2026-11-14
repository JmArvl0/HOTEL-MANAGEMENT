import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPeso } from "@/lib/format";
import { roomPhotoNeedsDirectUrl } from "@/lib/room-images";
import { StayProgress } from "./stay-progress";

export type MyStayCardData = {
  roomType: string; roomNumber?: string | null; photo?: string; dates: string;
  guests: number; status: string; stage: "held" | "payment" | "verification" | "confirmed";
  reference?: string; nextTitle: string; nextDetail: string; action: string; href: string;
  total: number; paid: number; balance: number; deposit: number; due: string;
  preferences?: string[]; submitted?: number; credit?: number;
};

export function MyStayCard({ stay, children }: { stay: MyStayCardData; children?: React.ReactNode }) {
  return <article className="my-stay-card" aria-label={stay.status === "Room held" ? "Booking in progress" : "My next stay"}>
    <div className="my-stay-room">
      {stay.photo && <div className="my-stay-image"><Image src={stay.photo} alt={`${stay.roomType} representative room photo`} fill sizes="(max-width: 680px) 100vw, 280px" unoptimized={roomPhotoNeedsDirectUrl(stay.photo)} /></div>}
      <div className="my-stay-room-copy">
        <span className="my-stay-status">{stay.status}</span>
        <h2>{stay.roomType}{stay.roomNumber && <small>Room {stay.roomNumber}</small>}</h2>
        <p>{stay.dates}</p><p>{stay.guests} guest{stay.guests === 1 ? "" : "s"}{stay.reference && <> · {stay.reference}</>}</p>
      </div>
    </div>
    <StayProgress stage={stay.stage} />
    <div className="my-stay-next">
      <div><h3>{stay.nextTitle}</h3><p>{stay.nextDetail}</p></div>
      <div className="my-stay-next-actions"><Link className="btn btn-accent" href={stay.href}>{stay.action}<ArrowRight size={16} aria-hidden="true" /></Link>{children}</div>
    </div>
    <section className="my-stay-payment" aria-label="Payment summary">
      <h3>Payment summary</h3>
      <dl><div><dt>Stay total</dt><dd>{formatPeso(stay.total)}</dd></div><div><dt>Verified paid</dt><dd>{formatPeso(stay.paid)}</dd></div><div><dt>Balance</dt><dd>{formatPeso(stay.balance)}</dd></div></dl>
      <p>{stay.stage === "held" || stay.stage === "payment" ? <>Deposit to confirm: <strong>{formatPeso(stay.deposit)}</strong>. </> : null}{stay.due}</p>
      {Boolean(stay.credit) && <p>Applied folio credit: {formatPeso(stay.credit!)}.</p>}
      {Boolean(stay.submitted) && <p>{formatPeso(stay.submitted!)} submitted for verification. It is excluded from verified paid.</p>}
    </section>
    {Boolean(stay.preferences?.length) && <details className="my-stay-preferences"><summary>Saved preferences ({stay.preferences!.length})</summary><p>Saved; subject to confirmation. Requests are sent to the hotel teams once your stay is confirmed.</p><ul>{stay.preferences!.map((preference, index) => <li key={index}>{preference}</li>)}</ul></details>}
  </article>;
}
