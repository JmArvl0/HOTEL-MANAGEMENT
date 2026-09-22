import GuestAiConciergePanel from "@/components/customer/guest-ai-concierge-panel";

export default function ConciergePage({
  searchParams,
}: {
  searchParams?: { reservationId?: string };
}) {
  return (
    <>
      <section className="customer-page-title">
        <p className="eyebrow">Virtual concierge</p>
        <h1>Ask HAVEN.</h1>
        <p>Hotel policies, amenities, and nearby recommendations — powered by AI, confirmed by you.</p>
      </section>
      <GuestAiConciergePanel reservationId={searchParams?.reservationId} />
    </>
  );
}
