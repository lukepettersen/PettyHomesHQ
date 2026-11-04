import { describe, expect, it } from "vitest";
import { cleanDigest, digestEmail, digestRows, weekStart, type DigestPa } from "./deadlineDigest";

const pa = (o: Partial<DigestPa>): DigestPa => ({ side: "buyer", personName: "Emma Sharpe & Vy Nguyen", address: "2001 Westwood Hills Drive, Saint Louis Park, MN 55426", dates: {}, dateStatus: {}, writtenStatementNA: false, hoa: false, ...o });

describe("weekly contingency deadlines email (owner request 2026-11-04)", () => {
  it("finds this week's and next week's open contingencies", () => {
    expect(weekStart("2026-11-04")).toBe("2026-11-02");
    const r = digestRows([
      pa({ dates: { inspection: "2026-11-03", writtenStatement: "2026-11-16", closing: "2026-11-05" } }),
      pa({ side: "seller", personName: "Pat Lee", address: "1 Main St", dates: { inspection: "2026-11-04" }, dateStatus: { inspection: "met" } }),
      pa({ personName: "Sam Ortiz", dates: { hoaRescission: "2026-11-10", writtenStatement: "2026-11-11" }, writtenStatementNA: true, hoa: true }),
    ], "2026-11-04");
    expect(r.thisWeek).toEqual([{ side: "buyer", names: "SHARPE/NGUYEN", date: "2026-11-03", address: "2001 Westwood Hills Drive, Saint Louis Park, MN 55426", what: "Inspection Deadline" }]);
    expect(r.nextWeek.map((x) => `${x.names} ${x.what}`)).toEqual(["ORTIZ HOA Doc Rescission Deadline"]);
  });
  it("writes the email like the assistant's", () => {
    const e = digestEmail(digestRows([pa({ dates: { inspection: "2026-11-03" } })], "2026-11-04"), "Luke", "2026-11-04");
    expect(e.subject).toBe("Weekly Contingency Report - Week of November 2nd");
    expect(e.body).toContain("Hi Luke! Here's your weekly update on upcoming contingency deadlines:");
    expect(e.body).toContain("**This Week**\n\n**BUYERS**\n\nSHARPE/NGUYEN | Tuesday, 11/03\n[2001 Westwood Hills Drive");
    expect(e.body).toContain("**SELLERS**\n\n**NONE**");
    expect(e.body).toContain("**Next Week**\n\n**BUYERS**\n\n**NONE**");
  });
  it("cleans settings", () => {
    expect(cleanDigest({ on: true, day: 9, time: "25:00", to: ["luke@pettyhomes.com", "nope"] })).toEqual({ on: true, day: 1, time: "08:00", from: "", to: ["luke@pettyhomes.com"] });
  });
});

describe("closings and listings emails (owner request 2026-11-04)", () => {
  it("lists closings this week (closed too), next week and further out", async () => {
    const { closingsEmail } = await import("./deadlineDigest");
    const e = closingsEmail([
      { side: "buyer", personName: "Jack Murphy & Shania Skrzypcak", address: "5551 W 93rd Street, Bloomington, MN 55437", closing: "2026-11-03", closedOn: "2026-11-03" },
      { side: "buyer", personName: "Ann Weesner", address: "4204 19th Avenue S, Minneapolis, MN 55407", closing: "2026-11-13", closedOn: null },
      { side: "buyer", personName: "Emma Sharpe & Vy Nguyen", address: "2001 Westwood Hills Drive", closing: "2026-11-20", closedOn: null },
      { side: "seller", personName: "Old Close", address: "x", closing: "2026-10-01", closedOn: "2026-10-01" },
    ], "Luke", "2026-11-04");
    expect(e.subject).toBe("Weekly Closing Report - Week of November 2nd");
    expect(e.body).toContain("**This Week**\n\n**BUYERS**\n\n**CLOSED** | Tuesday 11/03 | Murphy/Skrzypcak");
    expect(e.body).toContain("**Next Week**\n\n**BUYERS**\n\nBUYER | Friday 11/13 | Weesner");
    expect(e.body).toContain("**Further Out**\n\n**BUYERS**\n\nBUYER | Friday 11/20 | Sharpe/Nguyen");
    expect(e.body).not.toContain("Old Close");
  });
  it("groups listings by stage", async () => {
    const { listingsEmail, listingGroup } = await import("./deadlineDigest");
    expect([listingGroup("Active"), listingGroup("Coming soon"), listingGroup("Listing signed / Prep"), listingGroup("Withheld"), listingGroup("Consult scheduled")]).toEqual(["live", "live", "upcoming", "held", null]);
    const e = listingsEmail([
      { personName: "Kim Lyles", address: "8841 Nicollet Avenue S, Bloomington, MN 55420", status: "Active", active: null, photos: null },
      { personName: "Pat Holden", address: "720 3rd Avenue NE #211", status: "Coming soon", active: "2026-11-06", photos: null },
    ], "Luke", "2026-11-04");
    expect(e.subject).toBe("Weekly Listing Report - Week of November 2nd");
    expect(e.body).toContain("**HOLDEN**\n[720 3rd Avenue NE #211](https://www.google.com/maps/search/?api=1&query=720%203rd%20Avenue%20NE%20%23211)\nComing Soon - goes active Friday, November 6");
    expect(e.body).toContain("**Upcoming**\n\nNONE");
  });
});
