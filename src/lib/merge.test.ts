import { describe, expect, it } from "vitest";
import { fill, longDate, mergeValues, nameParts, SAMPLE } from "./merge";

describe("merge fields", () => {
  it("splits couple names", () => {
    expect(nameParts("Sam & Lena Ortiz")).toEqual({ first: "Sam & Lena", last: "Ortiz" });
    expect(nameParts("Sam Ortiz & Lena Brooks")).toEqual({ first: "Sam & Lena", last: "Ortiz/Brooks" });
    expect(nameParts("Bob Baker")).toEqual({ first: "Bob", last: "Baker" });
  });
  it("fills fields, reports empty ones, keeps unknown ones", () => {
    const v = mergeValues({ ...SAMPLE, lender: null });
    const r = fill("Hi {first_name}! Closing is {closing_date} at {address}. Lender: {lender_name}. {not_a_field}", v);
    expect(r.text).toBe("Hi Sam & Lena! Closing is Friday, November 20 at 2215 Hillside Ave, Edina. Lender: . {not_a_field}");
    expect(r.missing).toEqual(["lender_name"]);
  });
  it("writes dates and times the friendly way (12-hour)", () => {
    expect(longDate("2026-10-16")).toBe("Friday, October 16");
    expect(mergeValues(SAMPLE).inspection_appointment).toBe("Friday, October 16 at 10:00am");
  });
});
