import { describe, expect, it } from "vitest";
import { bulkDays, inBulkHours, nextAfterSend, nextBulkStart, OPT_OUT, pickTextRecipients, tomorrowStart, withOptOut } from "./bulkText";

// Nov 6, 2026 is CST (UTC-6): 9am Central = 15:00Z, 7pm = 01:00Z next day.
const at = (iso: string) => new Date(iso);

describe("mass text", () => {
  it("picks contacts with a phone who didn't reply STOP; a couple keeps both numbers", () => {
    const r = pickTextRecipients([
      { id: "a", name: "Sam & Lena Ortiz", phones: ["612-555-0101", "(612) 555-0102", "+1 612 555 0101"], tags: [] },
      { id: "b", name: "Pat", phones: [], tags: [] },
      { id: "c", name: "Jo", phones: ["6125550103"], tags: ["Text Unsubscribed"] },
      { id: "d", name: "Al", phones: ["555-0199"], tags: [] },
    ], "Text Unsubscribed");
    expect(r.send).toEqual([{ personId: "a", name: "Sam & Lena Ortiz", numbers: ["6125550101", "6125550102"] }]);
    expect(r.skipped).toEqual({ noPhone: 2, optedOut: 1 });
  });
  it("adds the opt-out line once", () => {
    expect(withOptOut("Hi Sam!")).toBe(`Hi Sam!\n\n${OPT_OUT}`);
    expect(withOptOut("Hi! Reply STOP to end")).toBe("Hi! Reply STOP to end");
  });
  it("only sends 9am–7pm Central and waits for the morning", () => {
    expect(inBulkHours(at("2026-11-06T14:59:00Z"))).toBe(false);
    expect(inBulkHours(at("2026-11-06T15:00:00Z"))).toBe(true);
    expect(inBulkHours(at("2026-11-07T00:59:00Z"))).toBe(true);
    expect(inBulkHours(at("2026-11-07T01:00:00Z"))).toBe(false);
    expect(nextBulkStart(at("2026-11-06T12:00:00Z")).toISOString()).toBe("2026-11-06T15:00:00.000Z");
    expect(nextBulkStart(at("2026-11-07T02:00:00Z")).toISOString()).toBe("2026-11-07T15:00:00.000Z");
    expect(tomorrowStart(at("2026-11-06T18:00:00Z")).toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });
  it("spaces texts a random 60–120 seconds apart, never past 7pm", () => {
    const now = at("2026-11-06T18:00:00Z");
    expect(nextAfterSend(now, 0).getTime() - now.getTime()).toBe(60000);
    expect(nextAfterSend(now, 0.999).getTime() - now.getTime()).toBe(120000);
    expect(nextAfterSend(at("2026-11-07T00:59:30Z"), 0.5).toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });
  it("estimates days from the daily limit", () => {
    expect(bulkDays(150, 200)).toBe(1);
    expect(bulkDays(241, 200)).toBe(2);
    expect(bulkDays(900, 1000)).toBe(3);
  });
});
