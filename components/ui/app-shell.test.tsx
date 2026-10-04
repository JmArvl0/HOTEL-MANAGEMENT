// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

afterEach(cleanup);

const NAV = [
  { href: "/a", label: "Alpha" },
  { href: "/b", label: "Beta" },
];

describe("AppShell", () => {
  it("renders sidebar nav, header title, theme toggle, command slot and children", () => {
    render(
      <AppShell
        brand="HAVEN"
        nav={NAV}
        activeHref="/a"
        title="Dashboard"
        onCommand={() => {}}
      >
        <p>Body content</p>
      </AppShell>
    );
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alpha" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /mode/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /search/i })).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();
  });

  it("collapses the sidebar on toggle", () => {
    render(
      <AppShell brand="HAVEN" nav={NAV} activeHref="/b" title="T" onCommand={() => {}}>
        <p>x</p>
      </AppShell>
    );
    const btn = screen.getByRole("button", { name: /collapse navigation/i });
    fireEvent.click(btn);
    expect(document.querySelector(".saas-shell.collapsed")).toBeTruthy();
  });
});
