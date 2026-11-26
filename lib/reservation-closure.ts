type ReasonOption = { value: string; label: string };

export const closureReasons: Record<"cancelled" | "no_show", ReasonOption[]> = {
  cancelled: [
    { value: "change_of_plans", label: "Guest changed plans" },
    { value: "duplicate_booking", label: "Duplicate booking" },
    { value: "travel_disruption", label: "Travel disruption" },
    { value: "payment_issue", label: "Payment issue" },
    { value: "hotel_initiated", label: "Hotel-initiated cancellation" },
    { value: "other", label: "Other" },
  ],
  no_show: [
    { value: "no_arrival", label: "Guest did not arrive by the cutoff" },
    { value: "unable_to_contact", label: "Unable to contact the guest" },
    { value: "travel_disruption", label: "Travel disruption" },
    { value: "other", label: "Other" },
  ],
};
