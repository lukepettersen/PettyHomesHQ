import { describe, expect, it } from "vitest";
import { addMinutes, apptName, contractAppointments, defaultTitle } from "./appointments";

describe("appointment names", () => {
  it("uses last names, both for couples with different last names", () => {
    expect(apptName("Sam & Lena Ortiz")).toBe("Ortiz");
    expect(apptName("Sam Ortiz & Lena Brooks")).toBe("Ortiz/Brooks");
    expect(apptName("Bob Baker")).toBe("Baker");
    expect(defaultTitle("Sam Ortiz & Lena Brooks", "call")).toBe("Ortiz/Brooks - Phone Call");
    expect(defaultTitle("Bob Baker", "other")).toBe("Baker - ");
  });
  it("adds minutes for the end time", () => {
    expect(addMinutes("12:00", 30)).toBe("12:30");
    expect(addMinutes("23:45", 60)).toBe("23:59");
  });
  it("shows contract dates as appointments", () => {
    const a = contractAppointments("Bob Baker", { address: "1 Main", inspAppt: "2026-10-16T10:00", inspection: "2026-10-20", writtenStatement: null, closing: "2026-11-20" });
    expect(a.map((x) => [x.title, x.date, x.start])).toEqual([
      ["Baker - Inspection", "2026-10-16", "10:00"], ["Baker - Inspection Deadline at 11:59pm", "2026-10-20", null], ["Baker - Close Date HOLD", "2026-11-20", null],
    ]);
  });
});
