import { ERROR_MESSAGES } from "@/lib/error-messages";
import { type ZodError, type ZodIssue } from "zod";

export const ERROR_COPY = {
  signIn: "Please sign in to continue.",
  permission: "You don't have permission to perform this action.",
  unavailable: "This service is temporarily unavailable. Please try again shortly.",
  load: "We couldn't load this information. Please try again.",
  unknown: "We couldn't confirm the update. Check the record before trying again.",
  fields: "Please check the highlighted details.",
} as const;

export type ErrorCategory = "validation" | "authentication" | "permission" | "not_found" | "conflict" | "business_rule" | "rate_limit" | "network" | "service" | "unknown_outcome";

/** The fallback is authored by the caller, never taken from a response/exception. */
export function userMessage(value: unknown, fallback: string = ERROR_COPY.load): string {
  if (value instanceof PublicError) return value.message;
  const text = typeof value === "string" ? value : value instanceof Error ? value.message : undefined;
  if (text && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, text) && !/^(?:Failed to fetch|NetworkError|TypeError|SyntaxError)/.test(text)) return ERROR_MESSAGES[text];
  if (text && generatedValidationMessage(text)) return text;
  return fallback;
}

export class PublicError extends Error {
  constructor(message: string, readonly code = "REQUEST_UNCONFIRMED", readonly outcome: "rejected" | "unknown" = "unknown") {
    super(userMessage(message, ERROR_COPY.unknown));
    this.name = "PublicError";
  }
}

export function errorCategory(status: number): ErrorCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limit";
  return status >= 500 ? "service" : "validation";
}

export function statusMessage(status: number): string {
  if (status === 401) return ERROR_COPY.signIn;
  if (status === 403) return ERROR_COPY.permission;
  if (status === 404) return "This record is unavailable. Refresh the page to check the latest information.";
  if (status === 409) return "This action could not be completed. Review the latest record before trying again.";
  if (status === 429) return "Please wait a moment before trying again.";
  return status >= 500 ? ERROR_COPY.unavailable : ERROR_COPY.fields;
}

const labels: Record<string, string> = {
  firstName: "your first name", lastName: "your last name", name: "the full name", guestName: "the guest's full name",
  email: "a valid email address", phone: "a valid phone number", mobile: "a valid mobile number", address: "your home address",
  password: "your password", currentPassword: "your current password", newPassword: "your new password", confirmPassword: "the matching password",
  guests: "the number of guests", guestCount: "the number of guests", passengerCount: "the number of passengers", seats: "the number of seats",
  roomType: "a room type", roomId: "a room", roomNumber: "a room number", number: "a room number", floor: "the floor",
  checkIn: "a check-in date", checkOut: "a check-out date", requestedCheckOut: "the requested check-out date",
  pickupDate: "a pickup date", returnDate: "a return date", pickupTime: "a pickup time", returnTime: "a return time", expectedArrival: "an arrival time",
  dateOfBirth: "the date of birth", reportDate: "a report date", serviceDate: "the service date", date: "a date",
  pickupLocation: "the pickup location", dropoffLocation: "the destination", returnLocation: "the return destination",
  requestTypes: "at least one request", requestOptions: "the selected requests", reason: "a reason", notes: "the notes", description: "a description",
  specialRequests: "your special requests", specialInstructions: "the special instructions", nationality: "the nationality",
  amount: "the amount", actualCash: "the counted cash", settledAmount: "the settled amount", quantity: "the quantity", unitCost: "the unit cost", nightlyRate: "the nightly rate",
  method: "a payment method", reference: "the transaction reference", source: "a booking source", role: "an available role", status: "an available status",
  rating: "a rating", comment: "your review", review: "your review", message: "a message", decision: "a decision", priority: "a priority", label: "a label",
  alt: "a photo description", imageKind: "a photo category", hotelTimezone: "the hotel time zone", startDate: "a start date", endDate: "an end date",
};
const internalField = /^(?:id|.*Id|.*Token|token|version|.*Version|idempotencyKey|attemptId)$/;

function generatedValidationMessage(text: string): boolean {
  const values = [...Object.values(labels), "this value"];
  for (const label of values) {
    const noun = label.replace(/^(?:a |an |the )/, "");
    if ([`Please enter ${label}.`, `Please check ${label}.`, `Please choose ${label}.`, `Please enter a whole number for ${noun}.`, `Please enter a valid value for ${noun}.`].includes(text)) return true;
    const escaped = noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`^(?:Use at least [0-9]+ characters for ${escaped}|Please keep ${escaped} to [0-9,]+ characters or fewer|Please enter (?:at least|more than|no more than|less than) [0-9.]+ for ${escaped})\\.$`).test(text)) return true;
  }
  return /^Please choose (?:at least [0-9]+ items?|no more than [0-9]+ items)\.$/.test(text)
    || /^Choose a transportation date from [0-9]{4}-[0-9]{2}-[0-9]{2} through [0-9]{4}-[0-9]{2}-[0-9]{2}\.$/.test(text);
}

export function safeFieldMessages(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, message]) => [key,
    typeof message === "string" ? userMessage(message, ERROR_COPY.fields)
    : Array.isArray(message) ? message.map(item => userMessage(item, ERROR_COPY.fields))
    : message && typeof message === "object" ? safeFieldMessages(message) : ERROR_COPY.fields]));
}

export function validationIssueMessage(issue: ZodIssue): string {
  const field = String(issue.path.at(-1) ?? "");
  if (internalField.test(field)) return "Reopen the latest record or booking page before continuing.";
  const label = labels[field] ?? "this value";
  if (issue.code === "custom") return userMessage(issue.message, `Please check ${label}.`);
  if (issue.code === "invalid_type") {
    if (issue.expected === "int") return `Please enter a whole number for ${label.replace(/^(?:a |an |the )/, "")}.`;
    if (issue.message === `Invalid input: expected ${issue.expected}, received undefined` ||
        issue.message === `Invalid input: expected ${issue.expected}, received null`) return `Please enter ${label}.`;
    return `Please enter a valid value for ${label.replace(/^(?:a |an |the )/, "")}.`;
  }
  if (issue.code === "too_small") {
    if (issue.origin === "string") return Number(issue.minimum) === 1 ? `Please enter ${label}.` : `Use at least ${issue.minimum} characters for ${label.replace(/^(?:a |an |the )/, "")}.`;
    if (issue.origin === "array") return `Please choose at least ${issue.minimum} item${issue.minimum === 1 ? "" : "s"}.`;
    return `Please enter ${issue.inclusive ? "at least" : "more than"} ${issue.minimum} for ${label.replace(/^(?:a |an |the )/, "")}.`;
  }
  if (issue.code === "too_big") {
    if (issue.origin === "string") return `Please keep ${label.replace(/^(?:a |an |the )/, "")} to ${Number(issue.maximum).toLocaleString("en-PH")} characters or fewer.`;
    if (issue.origin === "array") return `Please choose no more than ${issue.maximum} items.`;
    return `Please enter ${issue.inclusive ? "no more than" : "less than"} ${issue.maximum} for ${label.replace(/^(?:a |an |the )/, "")}.`;
  }
  if (issue.code === "invalid_format" && issue.format === "email") return "Please enter a valid email address.";
  if (issue.code === "invalid_value" || (issue.code === "invalid_union" && issue.discriminator)) return `Please choose ${label}.`;
  if (issue.code === "unrecognized_keys") return "Refresh the page and check the details before trying again.";
  return userMessage(issue.message, `Please check ${label}.`);
}

export function validationErrors(error: Pick<ZodError, "issues">) {
  const fieldErrors = Object.fromEntries(error.issues.filter(issue => issue.path.length > 0 && !internalField.test(String(issue.path.at(-1))))
    .map(issue => [issue.path.join("."), validationIssueMessage(issue)]));
  // Keep old flat-control callers compatible, but only alias unambiguous leaves.
  const fields = { ...fieldErrors };
  for (const issue of error.issues) {
    const leaf = String(issue.path.at(-1) ?? "");
    if (leaf && !internalField.test(leaf) && error.issues.filter(other => String(other.path.at(-1)) === leaf).length === 1) Object.defineProperty(fields, leaf, { value: validationIssueMessage(issue), enumerable: true, configurable: true });
  }
  // Legacy callers may have already closed a prompt. Give them a useful field instruction;
  // forms that render fieldErrors own their separate, single announcement summary.
  return { error: error.issues[0] ? validationIssueMessage(error.issues[0]) : ERROR_COPY.fields,
    code: "VALIDATION_ERROR", category: "validation" as const, outcome: "rejected" as const, fieldErrors, fields };
}

export function validationMessage(error: Pick<ZodError, "issues"> | undefined): string {
  return error?.issues[0] ? validationIssueMessage(error.issues[0]) : ERROR_COPY.fields;
}

export function validationBody(error: Pick<ZodError, "issues">, legacy: Record<string, unknown> = {}) {
  const normalized = validationErrors(error);
  const oldFields = legacy.fields;
  const flattened = oldFields && typeof oldFields === "object" && "formErrors" in oldFields;
  return { ...legacy, ...normalized,
    ...(typeof legacy.field === "string" && normalized.fields[legacy.field] ? { error: normalized.fields[legacy.field] } : {}),
    ...(flattened ? { fields: { formErrors: error.issues.filter(issue => !issue.path.length).map(validationIssueMessage),
      fieldErrors: Object.fromEntries([...new Set(error.issues.filter(issue => issue.path.length).map(issue => String(issue.path[0])))].map(field =>
        [field, error.issues.filter(issue => String(issue.path[0]) === field).map(validationIssueMessage)])) } } : {}) };
}
