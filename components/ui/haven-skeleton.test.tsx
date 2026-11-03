// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HavenSkeleton } from "./haven-skeleton";

afterEach(cleanup);

describe("HavenSkeleton", () => {
  it("renders a decorative md placeholder by default", () => {
    const { container } = render(<HavenSkeleton />);
    const atom = container.querySelector<HTMLElement>(".haven-skeleton");
    expect(atom).toBeTruthy();
    expect(atom!.getAttribute("data-size")).toBe("md");
    expect(atom!.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies inline overrides for width/height/radius/grow", () => {
    const { container } = render(
      <HavenSkeleton size="sm" width={120} height={9} radius={999} grow />,
    );
    const atom = container.querySelector<HTMLElement>(".haven-skeleton")!;
    expect(atom.getAttribute("data-size")).toBe("sm");
    const style = atom.style;
    expect(style.width).toBe("120px");
    expect(style.height).toBe("9px");
    expect(style.borderRadius).toBe("999px");
    // grow = flex:1 1 auto for icon+line notification rows
    expect(style.flex.startsWith("1 1")).toBe(true);
  });
});
