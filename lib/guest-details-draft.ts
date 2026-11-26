import type { MobileNumberDraft } from "@/components/ui/mobile-number-field";

const historyKey = "havenGuestDetailsEntry";
const maxDrafts = 5;
const fields = [
  "firstName", "lastName", "email", "address", "nationality", "expectedArrival", "noArrival",
  "breakfast", "specialRequests", "needRide", "serviceType", "pickupLocation", "dropoffLocation",
  "returnLocation", "pickupDate", "pickupTime", "returnDate", "returnTime", "passengerCount",
  "rideNote", "vehicleSeats", "luggageCount", "sharingEnabled",
] as const;
type DraftField = typeof fields[number];
type GuestDetailsDraft = {
  values: Partial<Record<DraftField, string>>;
  requestOptions: string[];
  ridePreferences: string[];
  mobile?: MobileNumberDraft;
};
export type { GuestDetailsDraft };

// History holds an opaque entry ID. Contact and ride details live only in this
// document's memory and can be restored only to the same signed-in booking.
const drafts = new Map<string, { scope: string; form: GuestDetailsDraft }>();

export function guestDetailsEntry(create = false): string | undefined {
  const state = window.history.state;
  if (typeof state?.[historyKey] === "string") return state[historyKey];
  if (!create) return;
  try {
    const id = crypto.randomUUID();
    window.history.replaceState({ ...state, [historyKey]: id }, "");
    return id;
  } catch {
    // The standard unload warning remains available when history can't be updated.
  }
}

export function readGuestDetailsDraft(scope: string): GuestDetailsDraft | undefined {
  const entry = guestDetailsEntry();
  const draft = entry ? drafts.get(entry) : undefined;
  return draft?.scope === scope ? draft.form : undefined;
}

export function discardGuestDetailsDraft(entry?: string) {
  if (entry) drafts.delete(entry);
}

export function saveGuestDetailsDraft(entry: string, scope: string, form: HTMLFormElement, mobile?: MobileNumberDraft) {
  const controls = Array.from(form.elements);
  const values: GuestDetailsDraft["values"] = {};
  const requestOptions: string[] = [];
  const ridePreferences: string[] = [];
  for (const control of controls) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    if (control instanceof HTMLInputElement && (control.type === "radio" || control.type === "checkbox") && !control.checked) {
      if (control.name === "noArrival" || control.name === "sharingEnabled") values[control.name] = "";
      continue;
    }
    if (control.name === "requestOption") requestOptions.push(control.value);
    if (control.name === "ridePreference") ridePreferences.push(control.value);
    if ((fields as readonly string[]).includes(control.name)) values[control.name as DraftField] = control.value;
  }
  drafts.delete(entry);
  drafts.set(entry, { scope, form: { values, requestOptions, ridePreferences, mobile } });
  if (drafts.size > maxDrafts) {
    const oldest = drafts.keys().next().value;
    if (oldest) drafts.delete(oldest);
  }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => drafts.clear());
