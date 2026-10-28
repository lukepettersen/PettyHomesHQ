import { describe, expect, it } from "vitest";
import { centralToUtc, scheduleLabel, scheduleProblem } from "./scheduledText";

describe("scheduled texts", () => {
  it("turns Central time into the right moment, daylight saving or not", () => {
    expect(centralToUtc("2026-10-30", "09:15").toISOString()).toBe("2026-10-30T14:15:00.000Z"); // CDT
    expect(centralToUtc("2026-12-01", "09:15").toISOString()).toBe("2026-12-01T15:15:00.000Z"); // CST
  });
  it("only allows 8am–8pm, in the future, within a year", () => {
    const now = new Date("2026-10-28T15:00:00Z"); // 10:00am Central
    expect(scheduleProblem("2026-10-29", "09:00", now)).toBeNull();
    expect(scheduleProblem("2026-10-29", "07:45", now)).toMatch(/8:00am/);
    expect(scheduleProblem("2026-10-29", "20:15", now)).toMatch(/8:00pm/);
    expect(scheduleProblem("2026-10-28", "10:00", now)).toMatch(/5 minutes/);
    expect(scheduleProblem("2028-01-01", "10:00", now)).toMatch(/year/);
    expect(scheduleProblem("", "10:00", now)).toMatch(/Pick/);
  });
  it("labels the time in Central", () => { expect(scheduleLabel(new Date("2026-10-30T14:15:00Z"))).toBe("Fri Oct 30 at 9:15am"); });
});
