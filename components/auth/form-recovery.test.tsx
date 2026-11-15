// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RegisterForm } from "./register-form";
import { ForgotPasswordForm } from "./forgot-password-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ getSession: vi.fn(), signIn: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("registration recovers from a rejected fetch and associates the next server error with its field", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({
    error: "Please enter a valid email address.", field: "email", fields: { email: "Please enter a valid email address." },
  }, { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<RegisterForm callbackUrl="/account" />);
  for (const [name, value] of Object.entries({ firstName: "Ava", lastName: "Reyes", email: "ava@example.invalid",
    password: "fixture-password", confirmPassword: "fixture-password" })) {
    fireEvent.change(container.querySelector('[name="' + name + '"]')!, { target: { value } });
  }
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "09171234567" } });
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: "Create guest account" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText("Please enter a valid email address.");
  const email = container.querySelector('[name="email"]')!;
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(email.getAttribute("aria-describedby")).toBe("register-field-email-error");
  await waitFor(() => expect(document.activeElement).toBe(email));
});

it("password reset releases its busy state when the network rejects the request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { container } = render(<ForgotPasswordForm loginHref="/login" />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "ava@example.invalid" } });
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: /Send verification code/ }) as HTMLButtonElement).disabled).toBe(false);
});
