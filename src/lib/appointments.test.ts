import { describe, expect, it } from "vitest";
import { addMinutes, apptName, defaultTitle } from "./appointments";

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
