import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LEGACY =
  /#084b55|#103e48|#176773|#136573|#f8f6f1|#85cbd0|#141815|#17363f|#c9783c|#dce4e1|#53676b|#328d9b|#2e6d77|#205a63|#28717b|#177583|#326b74|#385b63|#36565d|#4e8790|#72b3c0|#64787b|#687d80|#7a8c8e|#082f39|#061f29|#072f42|#092d42|#084651|#073b46|#176c75|#173b40|#0f4145|#123f45|#063b45|#123640|#133f49|#f5f5ed|#eaf1eb|#d9eced|#eef4eb|#edf1e9|#e9eee7|#e5ece5|#e7eeea|#edf2ee|#f2f7f5|#eaf4f2|#eaf1ee|#e2ebe7|#e0eeeb|#d5ece9|#f8faf7|#f4f7f4|#fcfbf7|#fdfcf8|#f5f5ec|#faf8f1|#d8ebe6|#e1e7e3|#cddbd8|#bcd8d6|#e8bab5|#fdf0ee|#7a2e29|#33566b|#b8860b|#b0c8c7|#bfd4d2|#d8e8e3|#edf3eb|#f7f9f6|#e1eeeb|#f4f5f1|#eef4f2|#eef6f3|#f0f5f2|#f1f5f2|#ecefea|#eef0ed|#f3f4f1|#f2f8f6|#e5f3eb|#daf2e7|#e6f1eb|#edf4f0|#e8f1ed|#e4efec|#d8e9e8|#e9edea|#edf3ef|#f2f5f1|#f4f5f0|#faf9f5|#e9eee7|#e5ece5|#e7eeea|#edf2ee|#e2ebe7|#e0eeeb|#d5ece9|#d8ebe6|#e9efe8|#f6f4ed|#fbfaf4|#fffdf8|#f1eee4|#eeeae0|#f5f3ed|#f7f5ef|#e2ddd0|#eae5d8|#ede8dc/i;

describe("fleetops surfaces: landing + auth", () => {
  it("landing carries no legacy coastal/teal hexes", () => {
    const css = readFileSync(join(process.cwd(), "app/(landing-page)/landing.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    expect(css).not.toMatch(LEGACY);
  });

  it("auth vault carries no legacy coastal/teal hexes", () => {
    const css = readFileSync(join(process.cwd(), "components/auth/auth-vault.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    expect(css).not.toMatch(LEGACY);
  });

  it("both surfaces anchor on FleetOps neutrals", () => {
    for (const file of ["app/(landing-page)/landing.css", "components/auth/auth-vault.css"]) {
      const css = readFileSync(join(process.cwd(), file), "utf8");
      expect(css).toContain("#111827");
      expect(css).toContain("#d1d5db");
    }
  });
});

describe("fleetops surfaces: guest portal + booking flow", () => {
  const FILES = [
    "app/customer-portal.css",
    "app/guest-booking.css",
    "app/(booking)/booking/search/search.css",
    "components/booking/room-details.css",
    "components/customer/notification-history.css",
  ];

  it("guest + booking stylesheets carry no legacy coastal/teal hexes", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(LEGACY);
    }
  });

  it("guest + booking stylesheets anchor on FleetOps neutrals", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8");
      expect(css, file).toContain("#111827");
      expect(css, file).toContain("#d1d5db");
    }
  });
});

describe("fleetops surfaces: staff portals", () => {
  // Ruling 2026-10-04 Slice B: manager-dashboard-theme.css long-tail literals are
  // NOT remapped — the file is deleted in Slice D. Only its root vars + high-
  // visibility nav/status/button rules move now. Everything else here is kept.
  const FILES = [
    "app/staff-ops-theme.css",
    "components/front-desk/fused-room-rack-panel.css",
    "components/ui/haven-data-controls.css",
    "components/ui/haven-select.css",
    "components/ui/Modal.css",
  ];

  it("staff stylesheets carry no legacy coastal/teal hexes", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(LEGACY);
    }
  });

  it("staff stylesheets anchor on FleetOps neutrals", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8");
      expect(css, file).toContain("#111827");
      expect(css, file).toContain("#d1d5db");
    }
  });

  it("manager theme carries no legacy hexes anywhere — no exemptions (Slice E)", () => {
    const css = readFileSync(join(process.cwd(), "app/manager-dashboard-theme.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    expect(css).not.toMatch(LEGACY);
  });

  it("manager root vars + status severities ride FleetOps (long tail dies in Slice D)", () => {
    const css = readFileSync(join(process.cwd(), "app/manager-dashboard-theme.css"), "utf8");
    expect(css).toContain("--db:#0f141b");
    expect(css).toContain("--dg:#e8edf4");
    expect(css).toMatch(/\.mr-issue\.high\{[^}]*#ef44441f/);
    expect(css).toMatch(/\.mr-issue\.warning\{[^}]*#f59e0b1f/);
    expect(css).toMatch(/\.mr-issue\.info\{[^}]*#3b82f61f/);
  });
});

describe("fleetops surfaces: owner + admin", () => {
  const FILES = [
    "components/admin/system-health.css",
    "components/admin/security-config.css",
  ];

  it("admin stylesheets carry no legacy coastal/teal hexes", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(LEGACY);
    }
  });

  it("admin stylesheets anchor on FleetOps semantics (neutrals arrive via vars)", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8");
      expect(css, file).toContain("#10b981");
      expect(css, file).toContain("#ef4444");
    }
  });
});

describe("fleetops surfaces: shared roots + final strip", () => {
  // Ruling 2026-10-04 Slice D: staff-ops-theme.css is KEPT — it is already the
  // FleetOps ops layer. Only coastal-theme.css is deleted (globals :root takes
  // over its var names with FleetOps values). AppShell stays unwired: existing
  // shells already ride the same tokens, and rewiring risks behavior regressions
  // for zero visual delta. Shell wiring is a follow-up, not this reskin.
  const FILES = [
    "app/globals.css",
    "app/design-tokens.css",
    "app/ui-primitives.css",
    "components/qr/qr-scanner.css",
    "components/qr/qr-placard.css",
    "components/ui/haven-loader.css",
  ];

  it("shared stylesheets carry no legacy coastal/teal hexes", () => {
    for (const file of FILES) {
      const css = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(LEGACY);
    }
  });

  it("coastal-theme.css is deleted and unimported (globals :root owns the base vars)", () => {
    expect(existsSync(join(process.cwd(), "app/coastal-theme.css"))).toBe(false);
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).not.toContain("coastal-theme");
    const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(globals.replace(/\s+/g, "")).toContain("--ink:#111827");
  });
});
