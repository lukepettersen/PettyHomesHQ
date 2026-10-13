import { describe, expect, it } from "vitest";
import { isDueForTouch, matchesAll, parseFilters, type PersonFacts } from "./filters";

const now = new Date("2026-10-12T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const base: PersonFacts = { stage: "Past Client", source: "Sphere", tags: ["Mailers"], followUpDays: 30, lastContactAt: daysAgo(40), assignedTo: "Luke Pettersen", hasUpcomingTask: false };

describe("smart list filters", () => {
  it("matches stage and tag together", () => {
    expect(matchesAll(base, [{ field: "stage", op: "is", value: "past client" }, { field: "tag", op: "has", value: "Mailers" }], now)).toBe(true);
    expect(matchesAll(base, [{ field: "tag", op: "hasNot", value: "Mailers" }], now)).toBe(false);
  });
  it("handles last contact and never", () => {
    expect(matchesAll(base, [{ field: "lastContact", op: "moreThan", value: "30" }], now)).toBe(true);
    expect(matchesAll(base, [{ field: "lastContact", op: "lessThan", value: "30" }], now)).toBe(false);
    expect(matchesAll({ ...base, lastContactAt: null }, [{ field: "lastContact", op: "never", value: "" }], now)).toBe(true);
  });
  it("knows who is due for a touch", () => {
    expect(isDueForTouch(base, now)).toBe(true);
    expect(isDueForTouch({ ...base, lastContactAt: daysAgo(5) }, now)).toBe(false);
    expect(isDueForTouch({ ...base, followUpDays: null }, now)).toBe(false);
    expect(isDueForTouch({ ...base, lastContactAt: null }, now)).toBe(true);
  });
  it("filters by upcoming task", () => {
    expect(matchesAll(base, [{ field: "upcomingTask", op: "is", value: "no" }], now)).toBe(true);
  });
  it("drops malformed stored filters", () => {
    expect(parseFilters([{ field: "stage", op: "is", value: "Lead" }, { field: "bogus", op: "is", value: "x" }, null, "x"])).toHaveLength(1);
    expect(parseFilters("nope")).toEqual([]);
  });
});
