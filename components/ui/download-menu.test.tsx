// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DownloadMenu } from "./download-menu";
import { Modal } from "./Modal";

afterEach(cleanup);

it("closes the menu before its enclosing modal on Escape", () => {
  const close = vi.fn();
  render(<Modal isOpen onClose={close} title="Receipt" portal footer={
    <DownloadMenu label="Download receipt" actions={[{ value: "pdf", label: "PDF document", run: vi.fn() }]} />
  }>Saved receipt</Modal>);
  const trigger = screen.getByRole("button", { name: "Download receipt" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  expect(screen.getByRole("option", { name: "PDF document" })).toBeTruthy();
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});

it("announces a failed download and lets the same option retry", async () => {
  const run = vi.fn().mockRejectedValueOnce(new Error("Unable to prepare the file. Try again.")).mockResolvedValueOnce(undefined);
  render(<DownloadMenu label="Download report" actions={[
    { value: "csv", label: "CSV file", run, successMessage: "CSV download started." },
  ]} />);
  const trigger = screen.getByRole("button", { name: "Download report" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("option", { name: "CSV file" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Try again/));
  expect(document.activeElement).toBe(trigger);
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("CSV download started."));
  expect(run).toHaveBeenCalledTimes(2);
});
