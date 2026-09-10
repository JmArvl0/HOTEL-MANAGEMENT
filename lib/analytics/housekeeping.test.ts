import { describe, expect, it } from "vitest";
import { actualTaskCount, forecastHousekeeping } from "@/lib/analytics/housekeeping";
import { shiftDate, type ReservationLike, type TaskLike } from "@/lib/analytics/types";

const TODAY = "2026-09-08";

const reservation = (over: Partial<ReservationLike>): ReservationLike => ({
  id: Math.random().toString(36).slice(2),
  status: "confirmed",
  check_in: TODAY,
  check_out: shiftDate(TODAY, 1),
  created_at: `${TODAY}T00:00:00Z`,
  ...over
});

const task = (over: Partial<TaskLike>): TaskLike => ({
  id: Math.random().toString(36).slice(2),
  status: "completed",
  created_at: `${TODAY}T08:00:00Z`,
  ...over
});

describe("forecastHousekeeping", () => {
  it("splits covering reservations into tomorrow's departures and stayovers", () => {
    const rows = [
      reservation({ check_in: shiftDate(TODAY, -1), check_out: shiftDate(TODAY, 1) }), // departs tomorrow
      reservation({ check_in: shiftDate(TODAY, -1), check_out: shiftDate(TODAY, 3) }), // stays over
      reservation({ status: "cancelled", check_in: shiftDate(TODAY, -1), check_out: shiftDate(TODAY, 3) })
    ];
    const forecast = forecastHousekeeping({ reservations: rows, tasks: [], today: TODAY, horizon: 2, inspectionRequired: false });
    const tomorrow = forecast.days[1];
    expect(tomorrow.checkoutCleans).toBe(1);
    expect(tomorrow.stayoverServices).toBe(1);
    expect(tomorrow.inspections).toBe(0); // policy off
    expect(tomorrow.totalTasks).toBe(2);
  });

  it("adds one inspection per checkout clean when policy requires inspections", () => {
    const rows = [reservation({ check_in: shiftDate(TODAY, -1), check_out: shiftDate(TODAY, 1) })];
    const forecast = forecastHousekeeping({ reservations: rows, tasks: [], today: TODAY, horizon: 2, inspectionRequired: true });
    expect(forecast.days[1].inspections).toBe(1);
    expect(forecast.days[1].totalTasks).toBe(2); // 1 clean + 1 inspection
  });

  it("uses today's open guest-request tasks for today, the historical rate for later days", () => {
    const openRequests = [
      task({ task_type: "guest_request", status: "pending" }),
      task({ task_type: "guest_request", status: "in_progress" }),
      task({ task_type: "guest_request", status: "completed" }) // not open — excluded
    ];
    const forecast = forecastHousekeeping({ reservations: [], tasks: openRequests, today: TODAY, horizon: 2, inspectionRequired: false });
    expect(forecast.days[0].guestRequestTasks).toBe(2);
    expect(forecast.days[1].guestRequestTasks).toBe(0.2); // 3 created in the trailing 14 days / 14
  });

  it("omits labor hours unless at least five real completed durations exist", () => {
    const two = [
      task({ started_at: "2026-09-07T09:00:00Z", completed_at: "2026-09-07T09:30:00Z" }),
      task({ started_at: "2026-09-06T09:00:00Z", completed_at: "2026-09-06T09:45:00Z" })
    ];
    const sparse = forecastHousekeeping({ reservations: [], tasks: two, today: TODAY, inspectionRequired: false });
    expect(sparse.days[0].estimatedLaborHours).toBeUndefined();
    expect(sparse.days[0].basisNote).toContain("No completed-task duration history");

    const durations = Array.from({ length: 5 }, (_, i) =>
      task({ started_at: `2026-09-0${3 + i}T09:00:00Z`, completed_at: `2026-09-0${3 + i}T10:00:00Z` }));
    const rich = forecastHousekeeping({ reservations: [reservation({})], tasks: durations, today: TODAY, inspectionRequired: false });
    const departureDay = rich.days[1]; // the reservation departs tomorrow → 1 turnover clean that day
    expect(departureDay.meanTaskMinutes).toBe(60);
    expect(departureDay.estimatedLaborHours).toBe(1); // 1 task × 60 min
  });

  it("ignores absurd durations (clock skew, overnight rollovers) when averaging", () => {
    const tasks = [
      ...Array.from({ length: 5 }, (_, i) =>
        task({ started_at: `2026-09-0${3 + i}T09:00:00Z`, completed_at: `2026-09-0${3 + i}T10:00:00Z` })),
      task({ started_at: "2026-09-07T09:00:00Z", completed_at: "2026-09-09T09:00:00Z" }) // 2 days — discarded
    ];
    const forecast = forecastHousekeeping({ reservations: [], tasks, today: TODAY, inspectionRequired: false });
    expect(forecast.days[0].meanTaskMinutes).toBe(60);
  });

  it("falls back to documented fixed workload cutoffs with a note when history is thin", () => {
    const forecast = forecastHousekeeping({ reservations: [], tasks: [], today: TODAY, inspectionRequired: false });
    expect(forecast.days[0].dataQuality).toBe("limited");
    expect(forecast.days[0].workload).toBe("low"); // 0 tasks under the fixed medium cutoff of 10
    expect(forecast.notes.some((note) => note.includes("fixed cutoffs"))).toBe(true);
  });
});

describe("actualTaskCount — evaluation basis", () => {
  it("counts tasks created on the Asia/Manila hotel day, not the UTC day", () => {
    // 2026-09-07T20:00Z is already 2026-09-08 04:00 in Manila.
    const tasks = [
      task({ created_at: "2026-09-07T20:00:00Z" }),
      task({ created_at: "2026-09-08T01:00:00Z" }),
      task({ created_at: "2026-09-08T15:00:00Z" })
    ];
    expect(actualTaskCount(tasks, "2026-09-08")).toBe(3);
    expect(actualTaskCount(tasks, "2026-09-07")).toBe(0);
  });
});
