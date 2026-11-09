import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100dvh",
        background: "#0f141b",
        color: "#e8edf4",
        fontFamily: "var(--font-sans), system-ui, -apple-system, Segoe UI, sans-serif",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 700,
            margin: "0 0 12px",
            letterSpacing: "-0.025em",
          }}
        >
          Reservation not found
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#93a0b4",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          This reservation reference doesn&rsquo;t exist or doesn&rsquo;t belong
          to your account. If you&rsquo;re looking for a booking you made, open
          <strong>My Reservations</strong> and select it from your list.
        </p>
        <Link href="/my-reservations">
          <button
            className="btn"
            style={{
              minHeight: "44px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 600,
              borderRadius: "10px",
            }}
          >
            Back to my reservations
          </button>
        </Link>
      </div>
    </div>
  );
}
