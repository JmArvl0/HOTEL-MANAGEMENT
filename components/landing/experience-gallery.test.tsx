// @vitest-environment jsdom
// Contract for the landing experience gallery: three scene buttons act as a
// toggle group (aria-pressed), first scene selected by default, and selecting
// a scene swaps the hero image alt and the h2 title (aria-live).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExperienceGallery } from "./experience-gallery";

afterEach(cleanup);

const scenes = [
  { name: "Slow mornings", title: "Make room for a slower morning." },
  { name: "Poolside afternoons", title: "A little sunshine. No hurry." },
  { name: "Restful evenings", title: "End the day somewhere beautiful." },
] as const;

function sceneButton(name: string) {
  return within(screen.getByRole("group", { name: "Explore the hotel" })).getByRole("button", { name });
}

describe("ExperienceGallery", () => {
  it("renders the three scene buttons", () => {
    render(<ExperienceGallery />);
    for (const scene of scenes) expect(sceneButton(scene.name)).toBeTruthy();
  });

  it("selects the first scene by default", () => {
    render(<ExperienceGallery />);
    expect(sceneButton(scenes[0].name).getAttribute("aria-pressed")).toBe("true");
    expect(sceneButton(scenes[1].name).getAttribute("aria-pressed")).toBe("false");
    expect(sceneButton(scenes[2].name).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(scenes[0].title);
    // thumbnails have alt="" so the hero image is the only one with an alt
    expect(screen.getByAltText(scenes[0].name)).toBeTruthy();
  });

  it("selecting a scene swaps the pressed state, hero image and title", () => {
    render(<ExperienceGallery />);
    fireEvent.click(sceneButton(scenes[1].name));
    expect(sceneButton(scenes[0].name).getAttribute("aria-pressed")).toBe("false");
    expect(sceneButton(scenes[1].name).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(scenes[1].title);
    expect(screen.getByAltText(scenes[1].name)).toBeTruthy();
  });
});
