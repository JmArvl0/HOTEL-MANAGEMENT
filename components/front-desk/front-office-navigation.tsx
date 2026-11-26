"use client";

import { BedDouble, CalendarDays, UsersRound } from "lucide-react";
import styles from "./front-office-navigation.module.css";

const destinations = [
  { id: "room_rack", label: "Rooms", icon: BedDouble },
  { id: "reservations", label: "Bookings", icon: CalendarDays },
  { id: "guests", label: "Guests", icon: UsersRound },
] as const;

export type FrontOfficeSection = (typeof destinations)[number]["id"];

export function isFrontOfficeSection(section: string): section is FrontOfficeSection {
  return destinations.some(destination => destination.id === section);
}

export default function FrontOfficeNavigation({ section, onNavigate }: {
  section: FrontOfficeSection;
  onNavigate: (section: FrontOfficeSection) => void;
}) {
  return <nav className={styles.navigation} aria-label="Front Office">
    {destinations.map(({ id, label, icon: Icon }) => (
      <button key={id} type="button" aria-current={id === section ? "page" : undefined} onClick={() => onNavigate(id)}>
        <Icon size={17} aria-hidden="true" /> {label}
      </button>
    ))}
  </nav>;
}
