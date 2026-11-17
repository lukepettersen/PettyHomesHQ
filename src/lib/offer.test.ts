import { describe, expect, it } from "vitest";
import { isoDay, missingTerms, normalizeOffer, offerSummary, paPrefill, termText, writtenStatementIncomplete } from "./offer";

const raw = {
  propertyAddress: "2215 Hillside Ave, Edina, MN", purchasePrice: 389000, earnestMoney: 10000, closingDate: "November 20, 2026",
  financingType: "fha", downPayment: { amount: 3.5, isPercentage: true }, sellerPaidClosingCosts: { hasClosingCosts: true, amount: 3, isPercentage: true },
  inspection: { hasInspection: true, days: 10 }, buyerBrokerCompensation: 2.5, appliancesIncluded: { allIncluded: false, excluded: ["Microwave"] },
  fhaReinspectionFeePayer: "seller", vaFundingFeePayment: "seller", materialDefectClause: { hasMaterialDefect: true, amount: 5000 },
};

describe("offer", () => {
  it("cleans Claude's answer with Relay's defaults", () => {
    const o = normalizeOffer(raw);
    expect(o.escalationClause).toEqual({ hasEscalation: false, increment: null, maxPrice: null });
    expect(o.writtenStatementClause?.hasWrittenStatement).toBe(false);
    expect(o.fhaReinspectionFeePayer).toBe("seller");
    expect(o.vaFundingFeePayment).toBeNull(); // VA-only, cleared for FHA
    expect(normalizeOffer({ sellerPaidClosingCosts: { hasClosingCosts: false, amount: 5 } }).sellerPaidClosingCosts).toEqual({ hasClosingCosts: false, amount: 0, isPercentage: false });
    expect(normalizeOffer({ financingType: "bitcoin", purchasePrice: "lots" })).toMatchObject({ financingType: null, purchasePrice: null });
  });
  it("lists required terms not given yet", () => {
    expect(missingTerms(normalizeOffer(raw))).toEqual([]);
    expect(missingTerms(normalizeOffer({ purchasePrice: 1, inspection: { hasInspection: false } }))).toEqual(["Property", "Earnest Money", "Closing Date", "Seller-Paid Closing Costs", "Financing", "Down Payment", "Buyer Broker Compensation", "Appliances Not Included"]);
    expect(writtenStatementIncomplete(normalizeOffer({ writtenStatementClause: { hasWrittenStatement: true, date: "Oct 1" } }))).toBe(true);
  });
  it("writes the note in Relay's format", () => {
    const s = offerSummary(normalizeOffer(raw));
    expect(s.split("\n").slice(0, 3)).toEqual(["RELAY: OFFER INSTRUCTIONS", "", "PROPERTY: 2215 Hillside Ave, Edina, MN"]);
    expect(s).toContain("PURCHASE PRICE: $389,000");
    expect(s).toContain("INSPECTION PERIOD: 10 calendar days");
    expect(s).toContain("SELLER-PAID CLOSING COSTS: 3%");
    expect(s).toContain("MICROWAVE NOT INCLUDED");
    expect(s).toContain("MATERIAL DEFECT AMOUNT: $5,000");
    expect(s).toContain("FHA TERMS:\nWHO PAYS REINSPECTION FEE: Seller");
    expect(termText(normalizeOffer(raw), "inspection")).toBe("Yes — 10 calendar days");
  });
  it("fills in the purchase agreement from an accepted offer", () => {
    expect(paPrefill(normalizeOffer(raw))).toEqual({ address: "2215 Hillside Ave, Edina, MN", price: "389000", em: "10000", sc: "11670", closing: "2026-11-20", fin: "FHA", defect: "Yes", writtenStatement_na: "yes" });
    expect(isoDay("September 18, 2026")).toBe("2026-09-18");
    expect(isoDay("soon")).toBe("");
  });
});
