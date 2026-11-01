import { describe, expect, it } from "vitest";
import { centralToUtc, SCHEDULE_TIMES, scheduleLabel, scheduleProblem } from "./scheduledText";

describe("scheduled texts", () => {
  it("turns Central time into the right moment, daylight saving or not", () => {
    expect(centralToUtc("2026-10-30", "09:15").toISOString()).toBe("2026-10-30T14:15:00.000Z"); // CDT
    expect(centralToUtc("2026-12-01", "09:15").toISOString()).toBe("2026-12-01T15:15:00.000Z"); // CST
  });
  it("only allows 8am–8pm, in the future, within a year", () => {
    const now = new Date("2026-10-28T15:00:00Z"); // 10:00am Central
    expect(scheduleProblem("2026-10-29", "09:00", now)).toBeNull();
    expect(scheduleProblem("2026-10-29", "07:30", now)).toMatch(/8:00am/);
    expect(scheduleProblem("2026-10-29", "20:30", now)).toMatch(/8:00pm/);
    expect(scheduleProblem("2026-10-28", "10:00", now)).toMatch(/5 minutes/);
    expect(scheduleProblem("2028-01-01", "10:00", now)).toMatch(/year/);
    expect(scheduleProblem("", "10:00", now)).toMatch(/Pick/);
    expect(scheduleProblem("2026-10-29", "09:15", now)).toMatch(/half hour/);
  });
  it("offers half hours from 8am to 8pm", () => { expect(SCHEDULE_TIMES[0]).toBe("08:00"); expect(SCHEDULE_TIMES[1]).toBe("08:30"); expect(SCHEDULE_TIMES.at(-1)).toBe("20:00"); });
  it("labels the time in Central", () => { expect(scheduleLabel(new Date("2026-10-30T14:15:00Z"))).toBe("Fri Oct 30 at 9:15am"); });
});

describe("quiet hours for automatic texts (owner 2026-11-01)", () => {
  it("is quiet before 8am and after 8pm Central", async () => {
    const { quietNow } = await import("./scheduledText");
    expect(quietNow(new Date("2026-11-03T13:59:00Z"))).toBe(true); // 7:59am CST
    expect(quietNow(new Date("2026-11-03T14:00:00Z"))).toBe(false); // 8:00am
    expect(quietNow(new Date("2026-11-04T02:00:00Z"))).toBe(false); // 8:00pm
    expect(quietNow(new Date("2026-11-04T02:01:00Z"))).toBe(true); // 8:01pm
  });
});
