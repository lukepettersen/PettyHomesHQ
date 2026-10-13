import { describe, expect, it } from "vitest";
import { cleanAnswers, factRows, fileLine, groupsFor, health, kMoney, toFileView } from "./files";

const raw = {
  id: "f1", kind: "listing", personId: "p1", statusId: "s1", statusSince: new Date("2026-10-01T12:00:00Z"), address: "2215 Hillside Ave, Edina", price: 389000,
  info: { lcSigned: "2026-10-02", ptype: "Townhome", hoa: "Yes" }, closedAt: null, person: { name: "Sam Ortiz" }, status: { name: "Active" },
  commission: { commission: "2.5%", bac: "2%" },
};

describe("status questions", () => {
  it("asks buyers more as they move along", () => {
    expect(groupsFor("buyer", 0, 5).map((g) => g.title)).toEqual(["What they're looking for", "Consult"]);
    expect(groupsFor("buyer", 2, 5).map((g) => g.title)).toEqual(["What they're looking for", "Buyer rep"]);
    expect(groupsFor("buyer", 4, 5).map((g) => g.title)).toEqual(["What they're looking for", "Buyer rep", "The offer"]);
  });
  it("asks listings for the home first, then the listing", () => {
    expect(groupsFor("listing", 0, 5).map((g) => g.title)).toEqual(["The home", "Consult"]);
    expect(groupsFor("listing", 3, 5).map((g) => g.title)).toEqual(["The listing", "The property"]);
  });
});

describe("cleaning answers", () => {
  it("splits address, price, info and commission", () => {
    const c = cleanAnswers("listing", { address: " 1 Main St ", price: "$389,000", commission: "2.5%", bac: "2%", hoa: "Yes", junk: "x" });
    expect(c).toEqual({ address: "1 Main St", price: 389000, info: { hoa: "Yes" }, commission: { commission: "2.5%", bac: "2%" } });
  });
  it("rejects bad values with a plain message", () => {
    expect(() => cleanAnswers("buyer", { consult: "tomorrow" })).toThrow("Consult date: pick a date.");
    expect(() => cleanAnswers("buyer", { timeframe: "soon" })).toThrow("pick one of the choices");
    expect(() => cleanAnswers("listing", {}, groupsFor("listing", 0, 5)[0].questions.filter((x) => x.required))).toThrow("Add the property address.");
  });
});

describe("commission is withheld without permission", () => {
  it("includes commission and BAC only for viewers who may see them", () => {
    const yes = toFileView(raw, true), no = toFileView(raw, false);
    expect([yes.commission, yes.bac]).toEqual(["2.5%", "2%"]);
    expect([no.commission, no.bac]).toEqual([null, null]);
    expect(JSON.stringify(no)).not.toContain("2.5%");
    expect(factRows(no).map(([k]) => k)).not.toContain("Commission");
    expect(factRows(yes)).toContainEqual(["Commission", "2.5%"]);
  });
  it("shows the rest of the facts", () => {
    expect(factRows(toFileView(raw, false))).toEqual([["List price", "$389,000"], ["Listing signed", "Oct 2"], ["Property", "Townhome · HOA"]]);
    expect(fileLine(toFileView(raw, false))).toBe("2215 Hillside Ave, Edina");
  });
});

describe("display helpers", () => {
  it("health and money", () => {
    expect([health(0), health(2), health(3)]).toEqual(["g", "y", "r"]);
    expect([kMoney(389000), kMoney(1250000), kMoney(2000000)]).toEqual(["$389k", "$1.25M", "$2M"]);
  });
});
