import { describe, expect, it } from "vitest";
import { buildRow, changedCells, colLetter, findRow, matchOption, parseSheetLink, splitAddress, type SheetShape } from "./salesSheet";

const headers = ["CLIENT NAME", "PROPERTY ADDRESS", "City", "ZIP Code", "CLOSE DATE", "DEAL TYPE", "MONTH", "Month #", "QUARTER", "YEAR", "SOURCE", "LENDER", "Referred From", "SALE PRICE", "SELLER CONTRIBUTIONS", "NET TO SELLER", "LIST PRICE", "NET %", "COMMISSION %", "GROSS COMMISSION", "INITIAL SOURCE"];
const shape: SheetShape = { headers, formulaCols: new Set([15, 17, 19]), options: { 11: ["BRYAN MEREDITH", "TODD KOCON", "CASH", "N/A", "OTHER"], 10: ["SPHERE", "PERSONAL REFERRAL"], 20: ["SPHERE", "ZILLOW", "OTHER LEAD"] } };
const deal = { personName: "Emma Sharpe & Vy Nguyen", address: "2001 Westwood Hills Drive, Saint Louis Park, MN 55426", closing: "2026-11-20", side: "buyer" as const, price: 675000, sc: "9200", lenderName: "Bryan Meredith", financing: "Conventional", referredBy: "Will & Katie Sharpe", listPrice: null, commission: "2.7", source: "Zillow Preferred" };

describe("sales sheet row (owner request 2026-10-28)", () => {
  it("reads the sheet link", () => {
    expect(parseSheetLink("https://docs.google.com/spreadsheets/d/1gYzvwrF0ZKkqgsSdbsLQNG5YjxENRIn-ko1FZXd1EnY/edit?gid=281840784#gid=281840784")).toEqual({ id: "1gYzvwrF0ZKkqgsSdbsLQNG5YjxENRIn-ko1FZXd1EnY", gid: 281840784 });
    expect(parseSheetLink("nope")).toBeNull();
  });
  it("splits the address and matches dropdowns", () => {
    expect(splitAddress("2001 Westwood Hills Drive, Saint Louis Park, MN 55426")).toEqual({ street: "2001 Westwood Hills Drive", city: "Saint Louis Park", zip: "55426" });
    expect(matchOption("Zillow Preferred", ["SPHERE", "ZILLOW"])).toBe("ZILLOW");
    expect(matchOption("bryan meredith", ["BRYAN MEREDITH"])).toBe("BRYAN MEREDITH");
  });
  it("fills what HQ knows, skips formulas and leaves Source blank", () => {
    const row = buildRow(shape, deal);
    expect(Object.fromEntries([...row].map(([i, v]) => [headers[i], v]))).toEqual({
      "CLIENT NAME": "Sharpe/Nguyen", "PROPERTY ADDRESS": "2001 Westwood Hills Drive", City: "Saint Louis Park", "ZIP Code": "55426", "CLOSE DATE": "11/20/2026",
      "DEAL TYPE": "BUYER", MONTH: "November", "Month #": "11", QUARTER: "4", YEAR: "2026", LENDER: "BRYAN MEREDITH", "Referred From": "Will & Katie Sharpe",
      "SALE PRICE": "$675,000", "SELLER CONTRIBUTIONS": "$9,200", "COMMISSION %": "2.7%", "INITIAL SOURCE": "ZILLOW",
    });
    expect(buildRow(shape, { ...deal, side: "seller", sc: "3%", listPrice: 699900 }).get(11)).toBe("N/A");
    expect(buildRow(shape, { ...deal, sc: "3%" }).get(14)).toBe("$20,250");
    expect(buildRow(shape, { ...deal, financing: "Cash" }).get(11)).toBe("CASH");
    expect(buildRow(shape, { ...deal, lenderName: "Some Bank" }).get(11)).toBe("OTHER");
  });
  it("updates close date and price, and finds the row", () => {
    expect([...changedCells(shape, { closing: "2026-12-05", price: 680000 }).values()]).toEqual(["12/5/2026", "December", "12", "4", "2026", "$680,000"]);
    const rows = [headers, ["Weesner", "4204 19th Ave S"], ["Sharpe/Nguyen", "2001 Westwood Hills Drive"]];
    expect(findRow(rows, deal, shape)).toBe(2);
    expect(findRow(rows, { ...deal, address: "1 Main St" }, shape)).toBeNull();
    expect(colLetter(0)).toBe("A"); expect(colLetter(27)).toBe("AB");
  });
});
