import { describe, expect, it } from "vitest";
import { cleanConfig, DEFAULT_STEPS, PAPER_TYPES, paperDetails, paperProblem, paperSchema, paperSteps, paperText, paperTitle } from "./paperwork";

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

  it("change form: only the checked boxes' steps, values filled, the contract date says where to find it", () => {
    const r = paperSchema.parse({ type: "change", values: { address: "4385 Trenton Lane N #212", checks: "price", price: "425000", newPrice: "409900", mls: "" } });
    expect(paperProblem(r)).toBeNull();
    expect(paperDetails(r)).toContain("Changing: Price change");
    const steps = paperSteps(r, "Susan Lach", DEFAULT_STEPS);
    expect(steps.some((s) => s.includes("New List Price: $409,900 (was $425,000)"))).toBe(true);
    expect(steps.some((s) => /Expiration/.test(s))).toBe(false);
    expect(steps.find((s) => s.includes("listing contract dated"))).toContain("____ (find it on the signed listing contract)");
    expect(steps[1]).toContain("Listing Number ____");
    expect(paperProblem(paperSchema.parse({ type: "change", values: { address: "x" } }))).toBe("Check what's changing.");
  });
  it("own forms: saved with their steps; unknown ones are refused", () => {
    const cfg = cleanConfig({ custom: [{ key: "c_abcd1234", label: "Buyer rep agreement" }, { key: "bad", label: "x" }], steps: { c_abcd1234: [{ text: "Open it for {client} at {address}", when: "" }], change: [{ text: "Only this", when: "price" }] } });
    expect(cfg.custom.map((c) => c.label)).toEqual(["Buyer rep agreement"]);
    expect(cfg.steps.listing).toEqual(DEFAULT_STEPS.listing);
    const r = paperSchema.parse({ type: "c_abcd1234", values: { address: "1 A St" } });
    expect(paperTitle(r, "Jo", cfg.custom)).toBe("Write up buyer rep agreement in ClickContracts · Jo");
    expect(paperSteps(r, "Jo", cfg.steps, cfg.custom)).toEqual(["Open it for Jo at 1 A St"]);
    expect(paperProblem(r)).toBe("That form was removed. Pick another.");
  });
});
