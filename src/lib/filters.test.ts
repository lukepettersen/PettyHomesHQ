import { describe, expect, it } from "vitest";
import { isDueForTouch, matchesAll, parseFilters, type PersonFacts } from "./filters";

const now = new Date("2026-10-12T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const base: PersonFacts = { stage: "Past Client", type: null, source: "Sphere", tags: ["Mailers"], followUpDays: 30, lastContactAt: daysAgo(40), assignedTo: "Luke Pettersen", hasUpcomingTask: false };

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
    const texted = { ...base, lastTextAt: daysAgo(40) };
    expect(isDueForTouch(texted, now)).toBe(true);
    expect(isDueForTouch({ ...texted, lastTextAt: daysAgo(5) }, now)).toBe(false);
    expect(isDueForTouch({ ...texted, followUpDays: null }, now)).toBe(false);
    expect(isDueForTouch({ ...texted, lastTextAt: null }, now)).toBe(true);
    // A recent call or email doesn't count; only texts do.
    expect(isDueForTouch({ ...texted, lastContactAt: daysAgo(1), lastCallAt: daysAgo(1) }, now)).toBe(true);
  });
  it("filters by upcoming task", () => {
    expect(matchesAll(base, [{ field: "upcomingTask", op: "is", value: "no" }], now)).toBe(true);
  });
  it("drops malformed stored filters", () => {
    expect(parseFilters([{ field: "stage", op: "is", value: "Lead" }, { field: "bogus", op: "is", value: "x" }, null, "x"])).toHaveLength(1);
    expect(parseFilters("nope")).toEqual([]);
  });
  it("tags: any of, all of, none of", () => {
    const p = { ...base, tags: ["Mailers", "A Lead"] };
    expect(matchesAll(p, [{ field: "tag", op: "hasAny", value: "Christmas Cards||A Lead" }], now)).toBe(true);
    expect(matchesAll(p, [{ field: "tag", op: "hasAll", value: "Mailers||Christmas Cards" }], now)).toBe(false);
    expect(matchesAll(p, [{ field: "tag", op: "hasNone", value: "Unsubscribed||Bounced" }], now)).toBe(true);
  });
  it("several stages, and assigned to nobody", () => {
    expect(matchesAll(base, [{ field: "stage", op: "isAny", value: "Sphere||Past Client" }], now)).toBe(true);
    expect(matchesAll(base, [{ field: "stage", op: "isNot", value: "Sphere||Past Client" }], now)).toBe(false);
    expect(matchesAll({ ...base, assignedTo: null }, [{ field: "assigned", op: "is", value: "Nobody" }], now)).toBe(true);
  });
  it("last call / text / email separately", () => {
    const p = { ...base, lastCallAt: daysAgo(100), lastTextAt: daysAgo(3), lastEmailAt: null };
    expect(matchesAll(p, [{ field: "lastCall", op: "moreThan", value: "90" }], now)).toBe(true);
    expect(matchesAll(p, [{ field: "lastText", op: "lessThan", value: "7" }], now)).toBe(true);
    expect(matchesAll(p, [{ field: "lastEmail", op: "never", value: "" }], now)).toBe(true);
  });
  it("upcoming birthdays and has a phone", () => {
    const p = { ...base, birthdays: ["10-20"], hasPhone: false };
    expect(matchesAll(p, [{ field: "birthday", op: "within", value: "14" }], now)).toBe(true);
    expect(matchesAll(p, [{ field: "birthday", op: "within", value: "3" }], now)).toBe(false);
    expect(matchesAll(p, [{ field: "hasPhone", op: "is", value: "no" }], now)).toBe(true);
  });
});
