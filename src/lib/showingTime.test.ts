import { describe, expect, it } from "vitest";
import { parseShowingEmail, pickListingTemplate, splitAgent, streetKey, to24 } from "./showingTime";

// Shaped like real ShowingTime emails (names, numbers and addresses changed).
const CONFIRMED = `| Showing Confirmed |
| 4385 Trenton Lane N Unit# #212 Plymouth, MN 55442 $199,900 | ACTIVE | ID# 7146362 [](http://maps.apple.com/x) Subdivision: Sagamore Presented by: Luke Pettersen Additional Listing Details[](https://matrix.example/x) |
| Showings by this Agent: 2 |
| Total # of Showings: 7 |
| Appointment Details |
| | Showing |
| | Sunday, November 1, 2026 |
| | 12:30 PM - 1:00 PM |
| | BRUCE NELSON |
| | Bridge Realty, LLC |
| More Details[](https://showingti.me/x) |
| Buyer's Agent Details |
| BRUCE NELSON Bridge Realty, LLC (952) 555-1514[](9525551514) 952-555-0021 (Office Main Line)[](9525550021) brucenelsonrealestate@outlook.com[](brucenelsonrealestate@outlook.com) |
| Listing Contacts |
| Sue Lane (Owner/Occupant) (612) 555-4835 (Mobile Phone)[](6125554835) sue@example.com[](sue@example.com) |
| For questions regarding this appointment, please contact the buyer's agent directly. |
| LA BSQ CONF 899860587 |`;

const RESCHEDULED = `| Showing Rescheduled |
| 9971 Colorado Lane N Brooklyn Park, MINNESOTA 55445 $400,000 | COMING SOON | ID# 7013495 Presented by: Luke Pettersen Additional Listing Details |
| | Showing |
| | Friday, April 17, 2026 |
| | 5:00 PM - 5:45 PM |
| | Friday, April 17, 2026 |
| | 2:30 PM - 3:15 PM |
| | Nick Fradella |
| | Coldwell Banker Realty |
| Buyer's Agent Details |
| Nick Fradella Coldwell Banker Realty 7635559384[](7635559384) 763-555-2882 (Office Main Line) nick.fradella@cbrealty.com |
| Listing Contacts |
| Mary Brown (Owner/Occupant) (612) 555-6452 (Mobile Phone) mb@example.com |
| LA BSQ REQ 866417409 |`;

describe("ShowingTime emails (owner request 2026-11-01)", () => {
  it("reads a showing on our listing", () => {
    const s = parseShowingEmail("SHOWING CONFIRMED | 4385 Trenton Lane N Unit# #212, Plymouth, MN 55442 Sun, 11/1 12:30 PM", CONFIRMED, new Date("2026-10-29T14:50:18Z"))!;
    expect(s).toMatchObject({ kind: "confirmed", address: "4385 Trenton Lane N #212, Plymouth, MN 55442", mlsId: "7146362", date: "2026-11-01", start: "12:30", end: "13:00",
      presentedBy: "Luke Pettersen", key: "st:899860587", total: 7, was: null });
    expect(s.agent).toEqual({ name: "Bruce Nelson", company: "Bridge Realty, LLC", mobile: "(952) 555-1514", office: "952-555-0021", email: "brucenelsonrealestate@outlook.com" });
    expect(s.seller).toEqual({ name: "Sue Lane", phone: "(612) 555-4835", email: "sue@example.com" });
  });
  it("ignores showings we booked, walk-throughs and feedback", () => {
    for (const subj of ["YOUR SHOWING CONFIRMED | 121 Fox Hollow Drive, Chanhassen, MN 55317 Fri, 10/30 1:15 PM", "WALK-THROUGH CONFIRMED | 4425 5th Street NE, Columbia Heights, MN 55421 Fri, 10/16 11:00 AM",
      "FEEDBACK RECEIVED | 4385 Trenton Lane N Unit# #212, Plymouth, MN 55442", "AGENT PREVIEW CONFIRMED | 720 3rd Avenue NE Unit# #211, Minneapolis, MN 55413 Fri, 10/23 4:00 PM"])
      expect(parseShowingEmail(subj, CONFIRMED, new Date())).toBeNull();
  });
  it("reads a cancellation (two spaces in the subject) and a reschedule's old time", () => {
    const c = parseShowingEmail("SHOWING  CANCELLED | 4385 Trenton Lane N Unit# #212, Plymouth, MN 55442 Sun, 11/1 12:30 PM", CONFIRMED.replace("Confirmed", "Cancelled"), new Date("2026-10-31T12:00:00Z"))!;
    expect(c).toMatchObject({ kind: "cancelled", date: "2026-11-01", start: "12:30", key: "4385 trenton lane n #212, plymouth, mn 55442|2026-11-01|12:30" });
    const r = parseShowingEmail("SHOWING RESCHEDULED | 9971 Colorado Lane N, Brooklyn Park, MINNESOTA 55445 Fri, 4/17 5:00 PM", RESCHEDULED, new Date("2026-04-17T02:35:20Z"))!;
    expect(r).toMatchObject({ kind: "rescheduled", address: "9971 Colorado Lane N, Brooklyn Park, MN 55445", date: "2026-04-17", start: "17:00", end: "17:45", was: { date: "2026-04-17", start: "14:30" } });
    expect(r.agent).toMatchObject({ name: "Nick Fradella", company: "Coldwell Banker Realty", mobile: "7635559384", email: "nick.fradella@cbrealty.com" });
  });
  it("reads HQ's own text version of the email (links as \"text (address)\")", () => {
    const html = CONFIRMED.replace(/\[\]\(([^)]*)\)/g, (_, u: string) => (/^\d+$/.test(u) ? ` (tel:${u})` : u.includes("@") ? ` (mailto:${u})` : ` (${u})`));
    const s = parseShowingEmail("SHOWING CONFIRMED | 4385 Trenton Lane N Unit# #212, Plymouth, MN 55442 Sun, 11/1 12:30 PM", html, new Date("2026-10-29T14:50:18Z"))!;
    expect(s.agent).toEqual({ name: "Bruce Nelson", company: "Bridge Realty, LLC", mobile: "(952) 555-1514", office: "952-555-0021", email: "brucenelsonrealestate@outlook.com" });
  });
  it("small pieces", () => {
    expect(to24("12:30 PM")).toBe("12:30"); expect(to24("12:05 AM")).toBe("00:05"); expect(to24("5:00 PM")).toBe("17:00");
    expect(splitAgent("Mary Ann Smith Compass", "maryann.smith@compass.com")).toEqual({ name: "Mary Ann Smith", company: "Compass" });
    expect(splitAgent("JO LEE Edina Realty", "agent123@x.com")).toEqual({ name: "Jo Lee", company: "Edina Realty" });
    expect(streetKey("4385 Trenton Lane N #212, Plymouth, MN 55442")).toBe("4385 Trenton");
    expect(streetKey("720 3rd Avenue NE #211")).toBe("720 3rd");
    expect(streetKey("6710 W 78th St")).toBe("6710 78th");
  });
  it("finds the listing's showing template, not its MLS favorite one", () => {
    const t = [{ name: "SPC 8841 Nicollet Buyer Agent MLS Favorite Text" }, { name: "SPC 8841 Nicollet Buyer Agent Showing Text" }, { name: "SPC Post Showing Feedback Text" }, { name: "SPC 88 Nicollet Showing" }];
    expect(pickListingTemplate(t, "8841 Nicollet Avenue S, Bloomington, MN 55420")?.name).toBe("SPC 8841 Nicollet Buyer Agent Showing Text");
    expect(pickListingTemplate(t, "4385 Trenton Lane N #212")).toBeNull();
  });
});
