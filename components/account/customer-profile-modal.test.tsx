// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CustomerProfileModal } from "./customer-profile-modal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CustomerProfileModal", () => {
  const defaultUser = {
    name: "Carl Garcia",
    email: "leovinoarevalo0@gmail.com",
  };

  it("does not render when isOpen is false", () => {
    render(
      <CustomerProfileModal
        isOpen={false}
        onClose={vi.fn()}
        user={defaultUser}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders with dimmed backdrop, hero identity, and form inputs when isOpen is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          profile: {
            name: "Carl Garcia",
            email: "leovinoarevalo0@gmail.com",
            mobile: "+63 912 345 6789",
            nationality: "Filipino",
            address: "123 Palm Ave, Manila",
          },
        }),
      })
    );

    render(
      <CustomerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        user={defaultUser}
      />
    );

    // Dialog exists with accessible role
    const dialog = screen.getByRole("dialog", { name: "My Profile" });
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Backdrop exists for background dimming
    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();

    // Hero identity card
    expect(screen.getByText("Carl Garcia")).toBeTruthy();
    expect(screen.getByText("leovinoarevalo0@gmail.com")).toBeTruthy();
    expect(screen.getByText("Verified Guest")).toBeTruthy();

    // Form inputs populate from fetch
    await waitFor(() => {
      expect((screen.getByLabelText(/Full Name/) as HTMLInputElement).value).toBe("Carl Garcia");
      expect((screen.getByLabelText(/Mobile Number/) as HTMLInputElement).value).toBe("+63 912 345 6789");
      expect((screen.getByLabelText(/Nationality/) as HTMLInputElement).value).toBe("Filipino");
      expect((screen.getByLabelText(/Home \/ Billing Address/) as HTMLTextAreaElement).value).toBe("123 Palm Ave, Manila");
    });
  });

  it("submits updated profile data via PATCH to /api/account/profile", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input === "/api/account/profile" && init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          profile: {
            name: "Carl Garcia",
            email: "leovinoarevalo0@gmail.com",
            mobile: "",
            nationality: "",
            address: "",
          },
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProfileUpdated = vi.fn();
    render(
      <CustomerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        user={defaultUser}
        onProfileUpdated={onProfileUpdated}
      />
    );

    const nameInput = screen.getByLabelText(/Full Name/) as HTMLInputElement;
    const submitBtn = screen.getByRole("button", { name: /Save Changes/ });

    // Wait for initial fetch to resolve so form is interactive
    await waitFor(() => {
      expect(submitBtn.hasAttribute("disabled")).toBe(false);
    });

    fireEvent.change(nameInput, { target: { value: "Carl Anthony Garcia" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Profile updated successfully.")).toBeTruthy();
    });

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === "/api/account/profile" && init?.method === "PATCH"
    );
    expect(patchCall).toBeTruthy();
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload.name).toBe("Carl Anthony Garcia");
    expect(onProfileUpdated).toHaveBeenCalledWith({ name: "Carl Anthony Garcia" });
  });

  it("calls onOpenSecurity when Account Security footer button is clicked", () => {
    const onOpenSecurity = vi.fn();
    const onClose = vi.fn();

    render(
      <CustomerProfileModal
        isOpen={true}
        onClose={onClose}
        user={defaultUser}
        onOpenSecurity={onOpenSecurity}
      />
    );

    const securityBtn = screen.getByRole("button", { name: /Account Security/ });
    fireEvent.click(securityBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onOpenSecurity).toHaveBeenCalled();
  });
});
