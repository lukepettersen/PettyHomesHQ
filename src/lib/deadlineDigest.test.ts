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
    expect(e.subject).toBe("Contingency deadlines · week of 11/02");
    expect(e.body).toContain("Hi Luke! Here's your weekly update on upcoming contingency deadlines:");
    expect(e.body).toContain("**This Week**\n\n**BUYERS**\n\nSHARPE/NGUYEN | Tuesday, 11/03\n[2001 Westwood Hills Drive");
    expect(e.body).toContain("**SELLERS**\n\n**NONE**");
    expect(e.body).toContain("**Next Week**\n\n**BUYERS**\n\n**NONE**");
  });
  it("cleans settings", () => {
    expect(cleanDigest({ on: true, day: 9, time: "25:00", to: ["luke@pettyhomes.com", "nope"] })).toEqual({ on: true, day: 1, time: "08:00", from: "", to: ["luke@pettyhomes.com"] });
  });
});
