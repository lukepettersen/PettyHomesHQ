import { describe, expect, it } from "vitest";
import { PAPER_TYPES, paperDetails, paperProblem, paperSchema, paperText, paperTitle } from "./paperwork";

describe("paperwork requests", () => {
  it("has the owner's forms", () => {
    expect(PAPER_TYPES.map((t) => t.label)).toEqual(["Listing contract", "Amendment", "Change form", "Cancellation", "Cancel & relist", "Other"]);
  });
  it("titles, details and the text read cleanly", () => {
    const r = paperSchema.parse({ type: "listing", values: { address: "12 Elm St, Austin, MN", price: "350000", start: "2026-11-10", end: "", junk: "x" }, notes: "Lockbox on back door" });
    expect(paperTitle(r, "Jane Smith")).toBe("Write up listing contract in ClickContracts · Jane Smith");
    expect(paperDetails(r)).toBe("Property address: 12 Elm St, Austin, MN\nList price: $350,000\nListing starts: 11/10/2026\nNotes: Lockbox on back door");
    expect(paperText(r, "Jane Smith", "Luke")).toMatch(/^HQ: Luke needs a listing contract for Jane Smith in ClickContracts\.\n/);
    expect(paperText(paperSchema.parse({ type: "amendment", values: { address: "1 A St" } }), "Jo", "Luke")).toContain("needs an amendment");
  });
  it("Other uses the form they typed and needs it", () => {
    const r = paperSchema.parse({ type: "other", values: { form: "Price reduction addendum", address: "1 A St" } });
    expect(paperTitle(r, "Jo")).toBe("Write up Price reduction addendum in ClickContracts · Jo");
    expect(paperProblem(paperSchema.parse({ type: "other", values: { address: "1 A St" } }))).toBe("Say which form.");
  });
  it("needs an address or a note, and a real form", () => {
    expect(paperProblem(paperSchema.parse({ type: "cancel", values: {} }))).toMatch(/address or a note/);
    expect(paperProblem(paperSchema.parse({ type: "cancel", values: {}, notes: "Buyer walked" }))).toBeNull();
    expect(paperSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});
