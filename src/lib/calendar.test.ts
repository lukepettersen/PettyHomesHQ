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
    const emails = [{ address: "megan@x.com", label: "Megan" }, { address: "jaylen@x.com", label: "Jaylen" }];
    expect(inviteeEmails(["Bob", "Luke Pettersen", "Someone"], team, { firstName: "Bob", emails: [{ address: "bob@x.com", label: "" }] })).toEqual([{ email: "bob@x.com", name: "Bob" }, { email: "luke@pettyhomes.com", name: "Luke Pettersen" }]);
    expect(inviteeEmails(["Bob"], team, { firstName: "Bob", emails: [] })).toEqual([]);
    expect(inviteeEmails(["megan@x.com", "Jaylen@x.com", "stranger@x.com"], team, { firstName: "Megan", emails })).toEqual([{ email: "megan@x.com", name: "Megan" }, { email: "jaylen@x.com", name: "Jaylen" }]);
  });
  it("keys contract events by contract and kind", () => {
    expect(contractKey("pa1", "inspection-deadline-at-pm")).toBe("pa:pa1:inspection-deadline-at-pm");
  });
});

describe("acceptForTeam (owner request 2026-11-03)", () => {
  it("marks only teammates as going", async () => {
    const { acceptForTeam, apptEvent } = await import("./calendar");
    const ev = acceptForTeam(apptEvent({ title: "Rotman - Consult", date: "2026-11-06", start: "16:30", end: "17:30", location: "" },
      [{ email: "Alyssa@pettyhomes.com", name: "Alyssa" }, { email: "client@gmail.com", name: "Jack" }]), ["alyssa@pettyhomes.com", "luke@pettyhomes.com"]);
    expect(ev.attendees).toEqual([{ email: "Alyssa@pettyhomes.com", displayName: "Alyssa", responseStatus: "accepted" }, { email: "client@gmail.com", displayName: "Jack" }]);
  });
});

describe("extra guests (owner request 2026-11-03)", () => {
  it("invites another contact or a typed address added with + Add someone", async () => {
    const { inviteeEmails, extraGuest } = await import("./calendar");
    expect(extraGuest("Pat Lee", "Pat@Lender.com")).toBe("Pat Lee <pat@lender.com>");
    expect(inviteeEmails(["Pat Lee <pat@lender.com>", "stranger@x.com", "sam@x.com <sam@x.com>"], [], { firstName: "Bob", emails: [] }))
      .toEqual([{ email: "pat@lender.com", name: "Pat Lee" }, { email: "sam@x.com", name: "sam@x.com" }]);
  });
});
