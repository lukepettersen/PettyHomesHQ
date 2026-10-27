import { describe, expect, it } from "vitest";
import { addMinutes, apptName, apptTypes, cleanApptTypes, defaultTitle } from "./appointments";

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
});

describe("appointment types (owner request 2026-10-27)", () => {
  it("keeps the built-ins, adds your own before Appointment, and validates", () => {
    const t = apptTypes([{ key: "showing", label: "Home Tour", mins: 45 }, { key: "c_abcd12", label: "Listing Appointment", mins: 90 }, { key: "bad key", label: "x", mins: 60 }]);
    expect(t.map((x) => x.label)).toEqual(["Phone Call", "Buyer Consult", "Seller Consult", "Home Tour", "Listing Appointment", "Appointment"]);
    expect(t.find((x) => x.key === "c_abcd12")?.mins).toBe(90);
    expect(defaultTitle("Bob Baker", "c_abcd12", t)).toBe("Baker - Listing Appointment");
    expect(() => cleanApptTypes([{ key: "c_abcd12", label: " ", mins: 60 }])).toThrow(/needs a name/);
    expect(() => cleanApptTypes([{ key: "c_abcd12", label: "Showing", mins: 60 }])).toThrow(/Two types/);
  });
});
