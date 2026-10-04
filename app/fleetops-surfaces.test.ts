import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LEGACY =
  /#084b55|#103e48|#176773|#136573|#f8f6f1|#85cbd0|#141815|#17363f|#c9783c|#dce4e1|#53676b|#328d9b|#2e6d77|#205a63|#28717b|#177583|#326b74|#385b63|#36565d|#4e8790|#72b3c0|#64787b|#687d80|#7a8c8e|#082f39|#061f29|#072f42|#092d42|#084651|#073b46|#176c75|#173b40|#0f4145|#123f45|#063b45|#123640|#133f49|#f5f5ed|#eaf1eb|#d9eced|#eef4eb|#edf1e9|#e9eee7|#e5ece5|#e7eeea|#edf2ee|#f2f7f5|#eaf4f2|#eaf1ee|#e2ebe7|#e0eeeb|#d5ece9|#f8faf7|#f4f7f4|#fcfbf7|#fdfcf8|#f5f5ec|#faf8f1|#d8ebe6|#e1e7e3|#cddbd8|#bcd8d6|#e8bab5|#fdf0ee|#7a2e29|#33566b|#b8860b|#b0c8c7|#bfd4d2|#d8e8e3|#edf3eb/i;

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
