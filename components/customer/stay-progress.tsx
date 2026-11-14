const STEPS = ["Room held", "Awaiting payment", "Verifying payment", "Confirmed"];

export function StayProgress({ stage }: { stage: "held" | "payment" | "verification" | "confirmed" }) {
  const current = { held: 0, payment: 1, verification: 2, confirmed: 3 }[stage];
  return <ol className="my-stay-progress" aria-label="Booking progress">
    {STEPS.map((step, index) => <li key={step} data-state={index < current ? "complete" : index === current ? "current" : "upcoming"} aria-current={index === current ? "step" : undefined}>
      <span aria-hidden="true">{index + 1}</span>{step}
    </li>)}
  </ol>;
}
