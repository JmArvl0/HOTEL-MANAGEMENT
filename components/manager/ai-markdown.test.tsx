// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AiMarkdown from "./ai-markdown";

describe("AiMarkdown", () => {
  it("renders ### as a heading, not literal hashes", () => {
    const { container } = render(<AiMarkdown text="### Supply Risk Summary" />);
    expect(container.querySelector("h4")).toBeTruthy();
    expect(screen.getByText("Supply Risk Summary")).toBeTruthy();
    expect(container.textContent).not.toContain("###");
  });

  it("renders ## as a heading", () => {
    const { container } = render(<AiMarkdown text="## Tomorrow" />);
    expect(container.querySelector("h3")).toBeTruthy();
  });

  it("renders **bold** without literal asterisks", () => {
    const { container } = render(<AiMarkdown text="- **FACT:** 1 of 4 items" />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("FACT:");
    expect(container.querySelector("ul")).toBeTruthy();
  });

  it("renders italic and inline code", () => {
    const { container } = render(<AiMarkdown text="*note* and `sku-1`" />);
    expect(container.querySelector("em")?.textContent).toBe("note");
    expect(container.querySelector("code")?.textContent).toBe("sku-1");
  });

  it("renders ordered lists and nested sub-bullets", () => {
    const { container } = render(
      <AiMarkdown text={"1. **Shampoo 40ml**\n   - Current stock: 42\n   - Risk: High\n2. Monitor sheets."} />
    );
    const top = container.querySelector("ol");
    expect(top).toBeTruthy();
    expect(top?.querySelector("ul")).toBeTruthy();
    expect(container.textContent).toContain("Current stock: 42");
  });

  it("keeps raw HTML and script content inert", () => {
    const { container } = render(
      <AiMarkdown text={'<script>alert("x")</script>\n<img src="x" onerror="alert(1)">'} />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<script>alert("x")</script>');
  });

  it("renders plain text as a normal paragraph", () => {
    const { container } = render(<AiMarkdown text="All stock levels look fine today." />);
    expect(container.querySelector("p")?.textContent).toBe("All stock levels look fine today.");
  });

  it("renders a horizontal rule without literal dashes", () => {
    const { container } = render(<AiMarkdown text={"Above\n\n---\n\nBelow"} />);
    expect(container.querySelector("hr")).toBeTruthy();
  });
});
