// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { Modal } from "./Modal";

// jsdom has no matchMedia; Modal reads it on every render for reduced motion.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, onchange: null,
         addListener: () => {}, removeListener: () => {},
         addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
  }
});
afterEach(cleanup);

// Mirrors room-roster-panel's Add Physical Room modal: the input value lives in
// the PARENT's state and onClose is an inline arrow, so every keystroke
// re-renders the Modal. Regression test for the bug where that re-render tore
// down the modal's open/close effect and modal.focus() stole focus from the
// input after every character.
function Host() {
  const [wing, setWing] = useState("");
  return (
    <Modal isOpen onClose={() => setWing("")} title="Add physical room">
      <label htmlFor="wing">Wing</label>
      <input id="wing" value={wing} onChange={(event) => setWing(event.target.value)} />
    </Modal>
  );
}

describe("Modal input focus", () => {
  it("keeps focus on the input across keystrokes while the parent re-renders", async () => {
    render(<Host />);
    // Flush the modal-open setTimeout so we start from the settled state.
    await act(async () => {});

    const input = screen.getByLabelText("Wing") as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    let value = "";
    for (const char of "Garden Wing") {
      value += char;
      fireEvent.change(input, { target: { value } });
      expect(document.activeElement).toBe(input);
    }

    expect(input.value).toBe("Garden Wing");
  });
});
