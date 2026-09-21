// @vitest-environment jsdom
// Contract for the shared staff HavenActionItem: icon | title + description |
// trailing. Owns layout only — callers own the data. Buttons navigate,
// plain divs inform; zero-count cards stay quiet but reachable.
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClipboardCheck } from "lucide-react";
import { HavenActionItem } from "./haven-action-item";
import { afterEach } from "vitest";

afterEach(cleanup);

describe("HavenActionItem", () => {
  it("renders icon, primary label and supporting description as a button", () => {
    const onAction = vi.fn();
    render(
      <HavenActionItem
        icon={ClipboardCheck}
        title="3 housekeeping tasks"
        description="Open room-care work"
        tone="amber"
        onAction={onAction}
      />
    );
    const card = screen.getByRole("button", {
      name: "3 housekeeping tasks: Open room-care work",
    });
    expect(card.className).toContain("haven-action-item");
    expect(card.textContent).toContain("3 housekeeping tasks");
    expect(card.textContent).toContain("Open room-care work");
    fireEvent.click(card);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("renders a quiet zero-count card that stays reachable", () => {
    render(
      <HavenActionItem
        icon={ClipboardCheck}
        title="0 pending approvals"
        description="Escalated guest issues"
        tone="rose"
        quiet
        onAction={() => {}}
      />
    );
    const card = screen.getByRole("button", {
      name: "0 pending approvals: Escalated guest issues",
    });
    expect(card.className).toContain("is-quiet");
  });

  it("renders informational cards as plain divs with no chevron", () => {
    const { container } = render(
      <HavenActionItem
        icon={ClipboardCheck}
        title="Rooms ready"
        description="Available for assignment now"
      />
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector(".haven-action-item-chevron")).toBeNull();
    expect(container.textContent).toContain("Rooms ready");
  });

  it("renders a custom trailing action instead of the chevron", () => {
    render(
      <HavenActionItem
        icon={ClipboardCheck}
        title="2 accounts need review"
        description="Based on suspension and recovery flags"
        trailing={<button type="button">Review</button>}
      />
    );
    expect(
      screen.getByRole("button", { name: "Review" })
    ).toBeTruthy();
  });

  it("renders the stat variant with a tabular value and detail line", () => {
    render(
      <HavenActionItem
        icon={ClipboardCheck}
        variant="stat"
        title="Needs attention"
        value={3}
        description="Suspended or recovery-required"
        onAction={() => {}}
      />
    );
    const card = screen.getByRole("button", { name: /Needs attention/ });
    expect(card.className).toContain("haven-action-item--stat");
    expect(card.textContent).toContain("Needs attention");
    expect(card.textContent).toContain("3");
    expect(card.textContent).toContain("Suspended or recovery-required");
  });
});
