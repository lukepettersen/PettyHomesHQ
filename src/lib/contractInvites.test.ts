import { describe, expect, it } from "vitest";
import { cleanRules, contractEvents, DEFAULT_RULES, fillTitle, type InviteRule } from "./contractInvites";

const ctx = { personName: "Bob Baker", address: "1 Main St, Edina", side: "buyer" as const, dates: { inspAppt: "2026-10-16T10:00", inspection: "2026-10-20", writtenStatement: null, closing: "2026-11-20", sewer: "2026-10-18T13:30" } };
const options = [{ key: "inspAppt", label: "Inspection appointment", withTime: true }, { key: "inspection", label: "Inspection deadline", withTime: false }, { key: "writtenStatement", label: "Written Statement", withTime: false }, { key: "closing", label: "Close date", withTime: false }, { key: "sewer", label: "Sewer scope", withTime: true }];

describe("contract invites", () => {
  it("the defaults make today's four events (written statement skipped when empty)", () => {
    expect(contractEvents(DEFAULT_RULES, ctx).map((e) => [e.ruleId, e.title, e.date, e.start])).toEqual([
      ["inspection", "Baker - Inspection", "2026-10-16", "10:00"],
      ["inspection-deadline-at-pm", "Baker - Inspection Deadline at 11:59pm", "2026-10-20", null],
      ["close-date-hold", "Baker - Close Date HOLD", "2026-11-20", null],
    ]);
  });
  it("custom titles, set times, sides and guests", () => {
    const rules: InviteRule[] = [
      { id: "a", on: true, date: "sewer", title: "{street} - Sewer Scope ({first_name})", time: "form", side: "buyer", team: true, client: false },
      { id: "b", on: true, date: "closing", title: "{last_name} closing", time: "09:00", side: "seller", team: true, client: true },
      { id: "c", on: false, date: "inspection", title: "off", time: "", side: "both", team: true, client: true },
    ];
    expect(contractEvents(rules, ctx)).toEqual([{ ruleId: "a", title: "1 Main St - Sewer Scope (Bob)", date: "2026-10-18", start: "13:30", team: true, client: false }]);
    expect(contractEvents(rules, { ...ctx, side: "seller" }).map((e) => [e.title, e.start])).toEqual([["Baker closing", "09:00"]]);
  });
  it("fills couple names", () => {
    expect(fillTitle("{last_name} / {first_name}", { personName: "Sam & Lena Ortiz", address: "" })).toBe("Ortiz / Sam & Lena");
  });
  it("checks rules from the Admin page", () => {
    expect(cleanRules([{ id: "x", date: "inspection", title: " Deadline ", time: "form", side: "nope" }], options)[0]).toEqual({ id: "x", on: true, date: "inspection", title: "Deadline", time: "", side: "both", team: true, client: false });
    expect(() => cleanRules([{ id: "x", date: "zzz", title: "T" }], options)).toThrow(/pick which date/);
    expect(() => cleanRules([{ id: "x", date: "closing", title: "" }], options)).toThrow(/title/);
  });
});
