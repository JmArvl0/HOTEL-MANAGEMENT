// @vitest-environment jsdom
// Contract for the shared ui/Navigation PageHeader hero: the default variant
// is the compact premium header and the band variant is the deep-teal hero
// treatment. Same markup either way — only the surface changes.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageHeader } from "./Navigation";

afterEach(cleanup);

describe("PageHeader", () => {
  it("renders eyebrow, title, subtitle and actions in the compact default", () => {
    render(
      <PageHeader
        eyebrow="Executive overview"
        title="Operations at a glance"
        subtitle="Live figures from today's records."
        actions={<button type="button">Export</button>}
      />
    );
    const header = screen.getByRole("banner");
    expect(header.className).not.toContain("band");
    expect(header.textContent).toContain("Executive overview");
    expect(screen.getByRole("heading", { name: "Operations at a glance" })).toBeTruthy();
    expect(header.textContent).toContain("Live figures from today's records.");
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("applies the band surface without changing the content contract", () => {
    render(<PageHeader eyebrow="Financial" title="Overview" variant="band" />);
    const header = screen.getByRole("banner");
    expect(header.className).toContain("band");
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
  });
});
