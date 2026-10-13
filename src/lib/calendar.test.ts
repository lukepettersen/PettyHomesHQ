import { describe, expect, it } from "vitest";
import { apptEvent, contractKey, inviteeEmails } from "./calendar";

describe("calendar events", () => {
  it("times appointments in Central time and invites people", () => {
    const e = apptEvent({ title: "Baker - Phone Call", date: "2026-10-16", start: "14:00", end: "14:30", location: "6125550002" }, [{ email: "a@x.com", name: "A" }, { email: "A@x.com", name: "A" }]);
    expect(e).toEqual({ summary: "Baker - Phone Call", location: "6125550002", start: { dateTime: "2026-10-16T14:00:00", timeZone: "America/Chicago" }, end: { dateTime: "2026-10-16T14:30:00", timeZone: "America/Chicago" }, attendees: [{ email: "a@x.com", displayName: "A" }] });
  });
  it("makes all-day events when there's no time, and an hour when there's no end", () => {
    expect(apptEvent({ title: "Baker - Close Date HOLD", date: "2026-11-20", start: null, end: null, location: "" })).toEqual({ summary: "Baker - Close Date HOLD", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } });
    expect(apptEvent({ title: "X", date: "2026-10-16", start: "09:00", end: null, location: "" }).end.dateTime).toBe("2026-10-16T10:00:00");
  });
  it("maps invitee names to emails", () => {
    const team = [{ name: "Luke Pettersen", email: "luke@pettyhomes.com" }];
    expect(inviteeEmails(["Bob", "Luke Pettersen", "Someone"], team, { firstName: "Bob", email: "bob@x.com" })).toEqual([{ email: "bob@x.com", name: "Bob" }, { email: "luke@pettyhomes.com", name: "Luke Pettersen" }]);
    expect(inviteeEmails(["Bob"], team, { firstName: "Bob", email: null })).toEqual([]);
  });
  it("keys contract events by contract and kind", () => {
    expect(contractKey("pa1", "Baker - Inspection Deadline at 11:59pm")).toBe("pa:pa1:inspection-deadline-at-pm");
    expect(contractKey("pa1", "Ortiz/Brooks - Close Date HOLD")).toBe("pa:pa1:close-date-hold");
  });
});
