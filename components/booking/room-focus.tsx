"use client";
import { useEffect } from "react";

/** Scrolls the focused room card (arrived via ?roomType=) into view once per search.
 *  Instant under prefers-reduced-motion — never animated, never focused, so screen-reader
 *  and keyboard users keep their place. */
export function RoomFocus({ roomType, searchKey }: { roomType: string; searchKey?: string }) {
  useEffect(() => {
    const card = document.querySelector(`[data-room-type="${CSS.escape(roomType)}"]`);
    card?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [roomType, searchKey]);
  return null;
}
