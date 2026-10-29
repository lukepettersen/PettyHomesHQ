import { describe, expect, it } from "vitest";
import { cleanFileAnswers, defaultFileForm, factRows, fileLine, health, kMoney, moneyOrPctShown, moneyTyped, pctShown, sectionsAt, toFileView } from "./files";

const B = [{ id: "b1" }, { id: "b2" }, { id: "b3" }, { id: "b4" }, { id: "b5" }];
const L = [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }, { id: "l5" }];
const buyer = defaultFileForm("buyer", B), listing = defaultFileForm("listing", L);
const names = (form: typeof buyer, s: string) => sectionsAt(form, s).map((x) => x.name);

const raw = {
  id: "f1", kind: "listing", personId: "p1", statusId: "l5", statusSince: new Date("2026-10-01T12:00:00Z"), address: "2215 Hillside Ave, Edina", price: 389000,
  info: { lcSigned: "2026-10-02", ptype: "Townhome", hoa: "Yes" }, closedAt: null, person: { name: "Sam Ortiz" }, status: { name: "Active" },
  commission: { commission: "2.5%", bac: "2%" },
};

describe("default forms keep the old status questions", () => {
  it("buyers", () => {
    expect(names(buyer, "b1")).toEqual(["What they're looking for", "Consult"]);
    expect(names(buyer, "b3")).toEqual(["What they're looking for", "Buyer rep"]);
    expect(names(buyer, "b5")).toEqual(["What they're looking for", "Buyer rep", "The offer"]);
  });
  it("listings", () => {
    expect(names(listing, "l1")).toEqual(["The home", "Consult"]);
    expect(names(listing, "l4")).toEqual(["The listing", "The property"]);
  });
});

describe("cleaning answers", () => {
  it("splits address, price, info and commission; ignores questions not shown", () => {
    const c = cleanFileAnswers(listing, "l4", { address: " 1 Main St ", price: "$389,000", commission: "2.5%", bac: "2%", hoa: "Yes", areas: "x" });
    expect([c.address, c.price, c.info, c.commission]).toEqual(["1 Main St", 389000, { hoa: "Yes" }, { commission: "2.5%", bac: "2%" }]);
    expect(c.shown.has("lcSigned")).toBe(true);
  });
  it("skips commission for viewers without the permission", () => {
    expect(cleanFileAnswers(listing, "l4", { address: "x", commission: "3%" }, { skipCommission: true }).commission).toEqual({ commission: "", bac: "" });
  });
  it("rejects bad values with a plain message", () => {
    expect(() => cleanFileAnswers(buyer, "b1", { consult: "tomorrow" })).toThrow("Consult date: pick a date.");
    expect(() => cleanFileAnswers(listing, "l1", { address: "x", timeframe: "soon" })).toThrow("pick one of the choices");
    expect(() => cleanFileAnswers(listing, "l1", {})).toThrow("Add the property address.");
  });
});

describe("commission is withheld without permission", () => {
  it("includes commission and BAC only for viewers who may see them", () => {
    const yes = toFileView(raw, true), no = toFileView(raw, false);
    expect([yes.commission, yes.bac]).toEqual(["2.5%", "2%"]);
    expect([no.commission, no.bac]).toEqual([null, null]);
    expect(JSON.stringify(no)).not.toContain("2.5%");
    expect(factRows(listing, no).map(([k]) => k)).not.toContain("Commission");
    expect(factRows(listing, yes)).toContainEqual(["Commission", "2.5%"]);
  });
  it("shows the rest of the facts in form order", () => {
    expect(factRows(listing, toFileView(raw, false))).toEqual([["List price", "$389,000"], ["Listing agreement signed", "Oct 2"], ["Property type", "Townhome"], ["HOA?", "Yes"]]);
    expect(fileLine(toFileView(raw, false))).toBe("2215 Hillside Ave, Edina");
  });
});

describe("12-hour times", () => {
  it("never shows 24-hour times", () => {
    const form = [{ id: "s", name: "S", fields: [{ key: "meet", label: "When is the meeting?", type: "datetime" as const }] }];
    expect(factRows(form, { ...toFileView(raw, false), kind: "buyer", info: { meet: "2026-10-13T20:00" } })).toEqual([["When is the meeting?", "Oct 13 8:00pm"]]);
  });
});

describe("display helpers", () => {
  it("health and money", () => {
    expect([health(0), health(2), health(3)]).toEqual(["g", "y", "r"]);
    expect([kMoney(389000), kMoney(1250000), kMoney(2000000)]).toEqual(["$389k", "$1.25M", "$2M"]);
  });
});

describe("money and percent boxes (owner request 2026-10-26)", () => {
  it("shows dollars however it's typed", () => {
    expect(["10000", "0010000", "$10,000", "10000.50", "10k", "$1.5M"].map(moneyTyped)).toEqual(["$10,000", "$10,000", "$10,000", "$10,000", "$10,000", "$1,500,000"]);
    expect(moneyTyped("")).toBe("");
  });
  it("shows percents with a % sign", () => {
    expect(["2.7", "2.70 %", "3%"].map(pctShown)).toEqual(["2.7%", "2.7%", "3%"]);
    expect(pctShown("")).toBe("");
  });
});

describe("Money or % display", () => {
  it("reads naturally", () => {
    expect(moneyOrPctShown("3%")).toBe("3%");
    expect(moneyOrPctShown("5000")).toBe("$5,000");
  });
  it("lists unanswered questions asked at the current status as a dash", () => {
    const form: FileSection[] = [{ id: "a", name: "Consult", fields: [{ key: "time", label: "Timeframe", type: "text" }, { key: "vacant", label: "Vacant?", type: "text" }, { key: "commission", label: "Commission", type: "moneypct" }] },
      { id: "b", name: "Later", statuses: ["s2"], fields: [{ key: "lockbox", label: "Lockbox", type: "text" }] }];
    const v = { ...toFileView({ id: "f", kind: "listing", personId: "p", statusId: "s1", statusSince: new Date(), address: null, price: null, info: { time: "0-3 months" }, closedAt: null, person: { name: "X" }, status: { name: "S1" } }, false) };
    expect(factRows(form, v, { blanks: true })).toEqual([["Timeframe", "0-3 months"], ["Vacant?", "—"]]);
    expect(factRows(form, v)).toEqual([["Timeframe", "0-3 months"]]);
  });
});
