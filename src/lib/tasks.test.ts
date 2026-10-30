import { describe, expect, it } from "vitest";
import { birthdayName, checklistOrder, categoryOf, dueLabel, formatTime, importantDateTasks, nextDue, parseQuickAdd, parseTime, stripPersonWord, pickPerson, titleCase } from "./tasks";

const TODAY = "2026-10-13"; // a Tuesday

describe("quick add", () => {
  it("reads person, weekday and time", () => {
    const p = parseQuickAdd("call lender re Ortiz Fri 9am", TODAY);
    expect(p).toMatchObject({ due: "2026-10-16", time: "09:00", personWord: "Ortiz" });
    expect(stripPersonWord(p.title, p.personWord!)).toBe("call lender");
  });
  it("reads repeats", () => {
    expect(parseQuickAdd("rent check every month", TODAY)).toMatchObject({ title: "rent check", repeat: "MONTHLY" });
    expect(parseQuickAdd("water plants daily", TODAY).repeat).toBe("DAILY");
  });
  it("reads list, priority and assignee", () => {
    expect(parseQuickAdd("order signs #marketing !high @alyssa tomorrow", TODAY)).toMatchObject({ title: "order signs", list: "marketing", priority: 3, assignee: "alyssa", due: "2026-10-14" });
  });
  it("same weekday means next week; next week is +7", () => {
    expect(parseQuickAdd("x tuesday", TODAY).due).toBe("2026-10-20");
    expect(parseQuickAdd("x next week", TODAY).due).toBe("2026-10-20");
  });
  it("leaves plain words alone", () => {
    expect(parseQuickAdd("renew license", TODAY)).toEqual({ title: "renew license" });
  });
});

describe("dates and times", () => {
  it("repeats to the next date, clamping month ends", () => {
    expect(nextDue("2026-01-31", "MONTHLY")).toBe("2026-02-28");
    expect(nextDue("2026-12-15", "MONTHLY")).toBe("2027-01-15");
    expect(nextDue("2026-10-13", "WEEKLY")).toBe("2026-10-20");
    expect(nextDue("2028-02-29", "YEARLY")).toBe("2029-02-28");
  });
  it("formats times and due labels", () => {
    expect(parseTime("2:30 pm")).toBe("14:30");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("25")).toBeNull();
    expect(formatTime("09:05")).toBe("9:05am");
    expect(dueLabel("2026-10-13", "14:00", TODAY)).toBe("Today 2:00pm");
    expect(dueLabel("2026-10-14", null, TODAY)).toBe("Tomorrow");
    expect(dueLabel("2026-10-10", null, TODAY)).toBe("Oct 10");
    expect(dueLabel("2026-10-16", null, TODAY)).toBe("Fri Oct 16");
  });
});

describe("category", () => {
  it("sorts each task into one list", () => {
    expect(categoryOf({ sourceKey: "date:a:b:2026", personId: "p" })).toBe("dates");
    expect(categoryOf({ repeat: "WEEKLY", personId: "p", listId: "l" })).toBe("recurring");
    expect(categoryOf({ listId: "l", personId: "p" })).toBe("list:l");
    expect(categoryOf({ personId: "p" })).toBe("clients");
    expect(categoryOf({})).toBe("misc");
  });
});

describe("important dates", () => {
  const team = [{ id: "u1", name: "Luke Pettersen" }, { id: "u2", name: "Alyssa Chakiton" }];
  const reminders = [
    { id: "r1", dateKind: "birthday", title: "Text happy birthday", days: 0, direction: "on", assignee: "Luke", kind: "text", appliesTo: "Everyone" },
    { id: "r2", dateKind: "birthday", title: "Send birthday card", days: 7, direction: "before", assignee: "Alyssa", kind: "task", appliesTo: "Past Client" },
  ];
  const base = { kind: "birthday", whose: "", personId: "p1", personName: "Sam & Lena Ortiz", assignedToId: null };
  it("applies rules by stage within the window", () => {
    const out = importantDateTasks([{ ...base, id: "d1", date: "1980-10-20", stage: "Past Client" }], reminders, team, TODAY);
    expect(out.map((t) => [t.key, t.due, t.assigneeId])).toEqual([["date:d1:r1:2026", "2026-10-20", "u1"], ["date:d1:r2:2026", "2026-10-13", "u2"]]);
    expect(out[0].title).toBe("Text Happy Birthday · Sam");
  });
  it("skips rules for other stages and dates outside the window", () => {
    expect(importantDateTasks([{ ...base, id: "d1", date: "1980-10-20", stage: "Lead" }], reminders, team, TODAY)).toHaveLength(1);
    expect(importantDateTasks([{ ...base, id: "d2", date: "1980-06-01", stage: "Lead" }], reminders, team, TODAY)).toHaveLength(0);
  });
  it("wraps into next year", () => {
    const out = importantDateTasks([{ ...base, id: "d3", date: "1990-01-05", whose: "Lena", stage: null }], reminders, team, "2026-12-20");
    expect(out[0]).toMatchObject({ due: "2027-01-05", title: "Text Happy Birthday · Lena" });
  });
  it("title-cases reminder names; homeiversaries don't add a name", () => {
    expect(titleCase("send homeiversary card")).toBe("Send Homeiversary Card");
    expect(titleCase("text happy birthday to them")).toBe("Text Happy Birthday to Them");
    const out = importantDateTasks([{ id: "h", kind: "homeiversary", whose: "", date: "2020-10-20", personId: "p", personName: "Sam & Lena Ortiz", stage: "Past Client", assignedToId: null }],
      [{ id: "r", dateKind: "homeiversary", title: "send homeiversary card", days: 0, direction: "on", assignee: "", kind: "task", appliesTo: "Everyone" }], [], "2026-10-12");
    expect(out[0].title).toBe("Send Homeiversary Card");
  });
  it("a homeiversary from this year's closing waits a year (owner report 2026-10-20)", () => {
    const home = { id: "h", kind: "homeiversary", whose: "", date: "2026-10-21", personId: "p", personName: "Jack & Darby Rotman", stage: "Past Client", assignedToId: null };
    const card = [{ id: "r", dateKind: "homeiversary", title: "Send homeiversary card", days: 7, direction: "before", assignee: "", kind: "task", appliesTo: "Everyone" }];
    expect(importantDateTasks([home], card, [], "2026-10-20")).toHaveLength(0);
    expect(importantDateTasks([home], card, [], "2027-10-01")[0].due).toBe("2027-10-14");
  });
});

describe("every other week", () => {
  it("repeats 14 days later and is understood by quick add", () => {
    expect(nextDue("2026-10-30", "BIWEEKLY")).toBe("2026-11-13");
    expect(parseQuickAdd("Pay Alyssa $500 every other week", "2026-10-17")).toMatchObject({ title: "Pay Alyssa $500", repeat: "BIWEEKLY" });
    expect(parseQuickAdd("payroll biweekly", "2026-10-17")).toMatchObject({ title: "payroll", repeat: "BIWEEKLY" });
    expect(parseQuickAdd("rent every week", "2026-10-17").repeat).toBe("WEEKLY");
  });
});

describe("weekday touches", () => {
  it("knows weekends and lists workdays", async () => {
    const { isWeekend, workdays } = await import("./tasks");
    const sat = new Date("2026-10-24T00:00:00Z");
    expect(isWeekend(sat)).toBe(true);
    expect(isWeekend(new Date("2026-10-26T00:00:00Z"))).toBe(false);
    expect(workdays(sat, 3).map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(workdays(new Date("2026-10-29T00:00:00Z"), 3).map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-10-29", "2026-10-30", "2026-11-02"]);
  });
});

describe("deal checklist order (owner request 2026-10-26)", () => {
  it("puts the section due soonest first and finished sections last", () => {
    const t = (phase: string, due: string | null, done = false) => ({ phase, due, done });
    const out = checklistOrder([
      t("Closing", "2026-11-13"), t("Closing", "2026-11-25"), t("Done one", "2026-10-01", true),
      t("Inspection", "2026-11-03"), t("Inspection", "2026-10-26"), t("Inspection", "2026-10-20", true), t("Later", null),
    ]);
    expect(out.map((s) => s.phase)).toEqual(["Inspection", "Closing", "Later", "Done one"]);
    expect(out[0].items.map((x) => x.due)).toEqual(["2026-10-26", "2026-11-03", "2026-10-20"]);
  });
});

describe("birthday card name (owner request 2026-10-27)", () => {
  it("addresses just the birthday person with their last name", () => {
    expect(birthdayName("Sam & Lena Ortiz", "Lena")).toBe("Lena Ortiz");
    expect(birthdayName("Sam Ortiz & Lena Brooks", "Lena")).toBe("Lena Brooks");
    expect(birthdayName("Sam & Lena Ortiz", "Mia")).toBe("Mia Ortiz");
    expect(birthdayName("Caitlin & Luke Pettersen", "")).toBe("Caitlin Pettersen");
    expect(birthdayName("Jane Smith", "Jane")).toBe("Jane Smith");
  });
});

describe("quick add: picking the right person (owner report 2026-10-30)", () => {
  const people = [{ name: "Jack Murphy & Shania Skrzypcak" }, { name: "Jack & Megan Schultz" }, { name: "Jack Rotman" }];
  it('"for Jack and Megan" picks the Schultzes and strips both names', () => {
    const p = parseQuickAdd("boulder creek house for Jack and Megan and check the search", "2026-10-30");
    expect(p).toMatchObject({ personWord: "Jack", personNext: "Megan" });
    const r = pickPerson(people, p.personWord!, p.personNext);
    expect(r.hit?.name).toBe("Jack & Megan Schultz");
    expect(stripPersonWord(p.title, p.personWord!, r.usedNext ? p.personNext : undefined)).toBe("boulder creek house and check the search");
  });
  it('"for Jack Rotman" uses the last name; a plain "for Jack" with several Jacks links no one', () => {
    const p = parseQuickAdd("call for Jack Rotman tomorrow", "2026-10-30");
    expect(pickPerson(people, p.personWord!, p.personNext).hit?.name).toBe("Jack Rotman");
    const q = parseQuickAdd("call for Jack about the inspection", "2026-10-30");
    expect(q.personNext).toBeUndefined();
    // Three Jacks and nothing else to go on: not obvious, so no one (it goes to Misc).
    expect(pickPerson(people, q.personWord!, q.personNext)).toEqual({ hit: null, usedNext: false, matches: 3 });
    expect(pickPerson([{ name: "Jack Rotman" }, { name: "Pat Stopper" }], "jack").hit?.name).toBe("Jack Rotman");
    expect(stripPersonWord(q.title, q.personWord!)).toBe("call about the inspection");
  });
});
