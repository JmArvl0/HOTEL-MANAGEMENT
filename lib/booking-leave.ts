export const BOOKING_LEAVE_EVENT = "haven:booking-leave";

export function canLeaveBooking() {
  return window.dispatchEvent(new Event(BOOKING_LEAVE_EVENT, { cancelable: true }));
}
