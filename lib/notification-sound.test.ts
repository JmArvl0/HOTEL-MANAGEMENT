// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSoundEnabled, playNotificationTone, setSoundEnabled } from "./notification-sound";

function stubStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  return store;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubStorage();
});

describe("notification-sound", () => {
  it("defaults to enabled when no preference is stored", () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it("persists the per-user mute toggle", () => {
    const store = stubStorage();
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(store.get("haven-sound-muted")).toBe("1");
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it("skips playback while muted without touching AudioContext", () => {
    setSoundEnabled(false);
    const spy = vi.fn();
    vi.stubGlobal("AudioContext", spy);
    playNotificationTone("error");
    expect(spy).not.toHaveBeenCalled();
  });

  it("degrades silently when WebAudio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playNotificationTone("success")).not.toThrow();
  });
});
