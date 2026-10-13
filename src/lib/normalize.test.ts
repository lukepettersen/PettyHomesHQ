import { describe, expect, it } from "vitest";
import { coupleName, daysUntilNext, dateFromIso, firstName, formatPhone, initials, normalizeEmail, normalizePhone, todayCentral } from "./normalize";

describe("phones and emails", () => {
  it("normalizes US numbers", () => {
    expect(normalizePhone("(612) 555-0101")).toBe("6125550101");
    expect(normalizePhone("+1 612 555 0101")).toBe("6125550101");
    expect(formatPhone("6125550101")).toBe("(612) 555-0101");
  });
  it("lowercases emails", () => expect(normalizeEmail("  Sam@Example.COM ")).toBe("sam@example.com"));
});

describe("names", () => {
  it("builds couple names", () => {
    expect(coupleName({ first: "Sam", last: "Ortiz" }, { first: "Lena", last: "" })).toBe("Sam & Lena Ortiz");
    expect(coupleName({ first: "Sam", last: "Ortiz" }, { first: "Lena", last: "Brooks" })).toBe("Sam Ortiz & Lena Brooks");
    expect(coupleName({ first: "Sam", last: "Ortiz" })).toBe("Sam Ortiz");
  });
  it("gets first names and initials", () => {
    expect(firstName("Sam Ortiz & Lena Brooks")).toBe("Sam");
    expect(initials("Sam Ortiz & Lena Brooks")).toBe("SO");
    expect(initials("Cher")).toBe("C");
  });
});

describe("dates", () => {
  it("counts days to the next yearly date", () => {
    const today = dateFromIso("2026-10-12");
    expect(daysUntilNext(dateFromIso("1985-10-20"), today)).toBe(8);
    expect(daysUntilNext(dateFromIso("1985-10-12"), today)).toBe(0);
    expect(daysUntilNext(dateFromIso("1985-10-11"), today)).toBe(364);
  });
  it("uses Central time for today", () => {
    // 3am UTC on Oct 13 is still Oct 12 in Minneapolis.
    expect(todayCentral(new Date("2026-10-13T03:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-12");
  });
});
