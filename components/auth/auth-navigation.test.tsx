// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RegisterForm } from "./register-form";
import LoginForm from "./login-form";

const { push, signIn } = vi.hoisted(() => ({ push: vi.fn(), signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn, getSession: async () => ({ user: { otpPending: false } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("credentials sign-in at an alternate local origin", () => {
  it.each(["register", "login"])("returns to the internal booking callback after %s", async (mode) => {
    const callbackUrl = "/booking/details?roomId=RM-101&guests=2";
    signIn.mockResolvedValue({ url: "http://localhost:3001/booking/details?roomId=RM-101", error: null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const { container } = render(mode === "register" ? <RegisterForm callbackUrl={callbackUrl} /> : <LoginForm callbackUrl={callbackUrl} />);
    fireEvent.change(screen.getByLabelText(mode === "register" ? "Email" : /Email address/), { target: { value: "guest@example.test" } });
    if (mode === "register") {
      fireEvent.change(container.querySelector('[name="password"]')!, { target: { value: "example-passphrase" } });
      fireEvent.change(container.querySelector('[name="confirmPassword"]')!, { target: { value: "example-passphrase" } });
    } else {
      fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "example-passphrase" } });
    }
    fireEvent.submit(container.querySelector("form")!);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(callbackUrl));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("localhost:3001"));
  });
});
