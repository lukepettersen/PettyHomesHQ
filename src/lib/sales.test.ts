import { describe, expect, it } from "vitest";
import { breakdown, clientNameOf, commissionPctOf, compareYears, contactNameFor, dashboard, familyOf, importKeyOf, lenderLabel, matchSale, moneyFor, periodOf,
  readSaleDate, readSalesCsv, sourceLabel, totals, yearSummary, type StatSale } from "./sales";

const s = (closeDate: string | null, o: Partial<StatSale> = {}): StatSale => ({ status: "closed", side: "buyer", closeDate, source: "SPHERE", referredFrom: "", price: 400000, listPrice: 400000, gross: 10800, net: 10152, commissionPaid: true, ...o });

describe("sales math, like the master file's SUMMARY and SALES COMPARE (owner request 2026-11-22)", () => {
  it("totals a set of sales", () => {
    const t = totals([s("2026-01-05"), s("2026-02-01", { price: 600000, listPrice: 500000, gross: 16200, net: 15228 })]);
    expect(t).toMatchObject({ deals: 2, volume: 1000000, avgPrice: 500000, gross: 27000, net: 25380 });
    expect(t.grossPct).toBeCloseTo(2.7); expect(t.splitPct).toBeCloseTo(94); expect(t.netPct).toBeCloseTo(111.11, 1);
  });
  it("summarizes by year, with buyer and seller, counting closed sales only", () => {
    const rows = [s("2025-03-01"), s("2026-01-01", { side: "seller" }), s("2026-05-01"), s(null, { status: "pending" }), s("2026-06-01", { status: "fell_through" })];
    const all = yearSummary(rows);
    expect(all.years.map((y) => [y.year, y.deals])).toEqual([[2025, 1], [2026, 2]]);
    expect(all.career.deals).toBe(3);
    expect(yearSummary(rows, "seller").career.deals).toBe(1);
  });
  it("compares the same month / quarter / year across years", () => {
    const rows = [s("2026-11-20"), s("2026-10-01"), s("2025-11-07"), s("2024-12-01"), s("2023-02-01")];
    const today = "2026-11-22";
    expect(compareYears(rows, periodOf("month", today)).map((y) => [y.year, y.deals])).toEqual([[2026, 1], [2025, 1], [2024, 0], [2023, 0]]);
    expect(compareYears(rows, periodOf("quarter", today)).map((y) => [y.year, y.deals])).toEqual([[2026, 2], [2025, 1], [2024, 1], [2023, 0]]);
    expect(compareYears(rows, periodOf("year", today)).map((y) => y.deals)).toEqual([2, 1, 1, 1]);
    expect(periodOf("quarter", today)).toMatchObject({ quarter: 4, label: "Q4" });
  });
  it("breaks a year down by lead source and referral", () => {
    const rows = [s("2026-01-01", { source: "TEAM LEAD" }), s("2026-02-01", { source: "SPHERE", price: 900000, referredFrom: "AJ Gimme" }), s("2026-03-01", { source: "SPHERE" }), s("2025-01-01")];
    expect(breakdown(rows, "source", periodOf("year", "2026-11-22"), 2026).map((b) => [b.key, b.deals])).toEqual([["SPHERE", 2], ["TEAM LEAD", 1]]);
    expect(breakdown(rows, "referredFrom", periodOf("year", "2026-11-22"), 2026)[0]).toMatchObject({ key: "AJ Gimme", deals: 1 });
  });
  it("shows pending, closed in the period and commission still owed", () => {
    const rows = [s(null, { status: "pending", price: 500000, gross: 13500 }), s("2026-11-20", { commissionPaid: false, gross: 17955, net: 16877.7 }), s("2026-03-01")];
    const d = dashboard(rows, periodOf("month", "2026-11-22"));
    expect(d.pending).toMatchObject({ deals: 1, volume: 500000, gross: 13500 });
    expect(d.closed.deals).toBe(1);
    expect(d.outstanding).toMatchObject({ deals: 1, gross: 17955, net: 16877.7 });
  });
});

describe("reading the master file and matching contacts", () => {
  const csv = [
    "CLIENT NAME,PROPERTY ADDRESS,City,ZIP Code,CLOSE DATE,DEAL TYPE,MONTH,Month #,QUARTER,YEAR,SOURCE,LENDER,Referred From,SALE PRICE,SELLER CONTRIBUTIONS,NET TO SELLER,LIST PRICE,NET %,COMMISSION %,GROSS COMMISSION,Brokerage Fee,LC,TC,E&O,Media Package,Home Readiness,Z Showcase,Referral Fee,Broker Admin,COMMISION,SPLIT %,DEAL COMPLETED?,COMMISSION PAID?,ON TIME CLOSE?,INITIAL SOURCE",
    'Sharpe/Nguyen,2001 Westwood Hills Drive,Saint Louis Park,55426,11/20/2026,BUYER,November,11,4,2026,PAST CLIENT REFERRAL,BRYAN MEREDITH,Will & Katie Sharpe,"$665,000.00","$10,000.00","$655,000.00","$699,900.00",93.58%,2.70%,"$17,955.00",$0.00,$0,$0,$0,$0,$0,$0,$0,$695,"$16,877.70",94.00%,YES,NO,YES,SPHERE',
    "Cronin,1427 Monroe St NE,Minneapolis,55413,5/18/18,BUYER,May,5,2,2018,SPHERE,OTHER,None,354000,5000,349000,320000,109.06%,2.70%,9558,,,,,,,,,,5734.80,60.00%,YES,YES,YES,SPHERE",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#REF,,,,",
  ].join("\n");
  it("reads the DATA tab's columns", () => {
    const r = readSalesCsv(csv);
    expect(r.problem).toBeNull();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ clientName: "Sharpe/Nguyen", closeDate: "2026-11-20", side: "buyer", price: 665000, contributions: 10000, listPrice: 699900, commissionPct: 2.7,
      gross: 17955, fees: 695, net: 16877.7, splitPct: 94, commissionPaid: false, referredFrom: "Will & Katie Sharpe", source: "PAST CLIENT REFERRAL" });
    expect(r.rows[1]).toMatchObject({ closeDate: "2018-05-18", referredFrom: "", commissionPaid: true, fees: 0 });
    expect(readSalesCsv("a,b\n1,2").problem).toMatch(/headings/);
    expect(readSaleDate("2/30/2026")).toBeNull();
    expect(importKeyOf("2026-11-20", "buyer", "2001 Westwood Hills Drive")).toBe("2026-11-20|buyer|2001 westwood");
  });
  it("matches by address and name, and leaves unsure ones for review", () => {
    const people = [
      { id: "a", name: "Will & Katie Sharpe", addresses: ["3344 Alabama Ave S, St. Louis Park"], pastClient: true },
      { id: "b", name: "Tony Wagner & Laura Schmidt", addresses: ["3804 Harriet Ave, Minneapolis"], pastClient: true },
      { id: "c", name: "Brian Brown", addresses: [], pastClient: true },
      { id: "d", name: "Kelly Brown", addresses: [], pastClient: false },
      { id: "e", name: "Pat Weesner", addresses: [], pastClient: false },
      { id: "f", name: "Someone Else", addresses: ["2001 Westwood Hills Dr"], pastClient: false },
    ];
    expect(matchSale({ clientName: "Wagner/Schmidt", address: "3804 Harriet" }, people)).toEqual({ sure: ["b"], maybe: [] });
    expect(matchSale({ clientName: "Sharpe", address: "3344 Alabama Ave S" }, people).sure).toEqual(["a"]);
    expect(matchSale({ clientName: "Wagner/Schmidt", address: "1 Other St" }, people).sure).toEqual(["b"]); // both names, only one contact
    expect(matchSale({ clientName: "Brown", address: "6524 Riverwood Lane" }, people).maybe.map((m) => m.id)).toEqual(["c", "d"]); // two Browns: review
    expect(matchSale({ clientName: "Weesner", address: "4204 19th Ave S" }, people).maybe.map((m) => m.id)).toEqual(["e"]);
    expect(matchSale({ clientName: "Sharpe/Nguyen", address: "2001 Westwood Hills Drive" }, people).maybe.map((m) => [m.id, m.why])).toEqual([["f", "same address"]]);
    expect(matchSale({ clientName: "Zzyzx", address: "9 Nowhere" }, people)).toEqual({ sure: [], maybe: [] });
    expect(familyOf("Honey Brothers 2")).toEqual(["brothers"]);
    expect(contactNameFor("Sharpe/Nguyen")).toBe("Sharpe & Nguyen");
  });
});

describe("a sale from a purchase agreement", () => {
  it("fills in the master file's columns", () => {
    expect(commissionPctOf("2.7", 400000)).toBe(2.7);
    expect(commissionPctOf("$5,000", 400000)).toBe(1.25);
    expect(commissionPctOf("", 400000)).toBe(0);
    expect(lenderLabel("seller", "", "")).toBe("N/A");
    expect(lenderLabel("buyer", "Cash", "")).toBe("CASH");
    expect(lenderLabel("buyer", "Conventional", "Bryan Meredith")).toBe("BRYAN MEREDITH");
    expect(sourceLabel("Zillow Preferred")).toBe("ZILLOW");
    expect(sourceLabel("Sphere Referral")).toBe("SPHERE REFERRAL");
    expect(clientNameOf("Will & Katie Sharpe")).toBe("Sharpe");
    expect(clientNameOf("Tony Wagner & Laura Schmidt")).toBe("Wagner/Schmidt");
    expect(moneyFor(665000, 2.7, 94)).toEqual({ gross: 17955, net: 16877.7 });
  });
});
