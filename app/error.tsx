"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Haven reservation page error:", error);
  }, [error]);

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
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#93a0b4",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          We couldn&rsquo;t load your reservation. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="btn"
          style={{
            minHeight: "44px",
            padding: "12px 24px",
            fontSize: "14px",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
