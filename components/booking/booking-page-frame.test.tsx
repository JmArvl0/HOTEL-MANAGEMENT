// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";

vi.mock("next/navigation", () => ({
  usePathname: () => "/booking/review/hold-token",
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

describe("BookingPageFrame", () => {
  it("places a go back control directly after the breadcrumb, labelled by the previous step", () => {
    render(
      <BookingPageFrame
        session={null}
        step="Review"
        breadcrumb={[
          { label: "Find a Room", href: "/account/find-room" },
          { label: "Review", current: true },
        ]}
      >
        <div>Review content</div>
      </BookingPageFrame>,
    );

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    const goBack = screen.getByRole("button", { name: "Back to Find a Room" });
    expect(breadcrumb.nextElementSibling).toBe(goBack);
  });
});
