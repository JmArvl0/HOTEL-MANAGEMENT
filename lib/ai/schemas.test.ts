import { describe, expect, it } from "vitest";
import { BriefSchema } from "@/lib/ai/schemas";

// Brief priority actions may carry the owning queue so the HAVEN AI panel
// can link each recommendation into its real module. The tag is optional —
// older briefs and tag-less actions render as plain text.
describe("brief priority-action queue tags", () => {
  it("accepts a known owning queue on an action", () => {
    const parsed = BriefSchema.safeParse({
      summary: "Busy Saturday ahead.",
      priority_actions: [{ action: "Prepare extra checkout coverage", rationale: "9 checkout cleans.", queue: "housekeeping_tasks" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priority_actions[0].queue).toBe("housekeeping_tasks");
  });

  it("accepts actions without a queue tag", () => {
    const parsed = BriefSchema.safeParse({
      summary: "Steady day.",
      priority_actions: [{ action: "Confirm tomorrow's arrivals", rationale: "Two VIP arrivals." }],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses an unknown queue tag", () => {
    const parsed = BriefSchema.safeParse({
      summary: "Steady day.",
      priority_actions: [{ action: "Do something", queue: "warp_drive" }],
    });
    expect(parsed.success).toBe(false);
  });
});
