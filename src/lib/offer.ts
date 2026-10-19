// Submit offer (SPEC.md §7.5): offer terms dictated by voice and organized by Claude, ported from the
// Relay app. Field shapes, the required-terms check and the "RELAY: OFFER INSTRUCTIONS" note match Relay,
// so offers read the same as before. Pure, unit tested in offer.test.ts.

export type Payer = "buyer" | "seller";
export type OfferData = {
  propertyAddress: string | null;
  purchasePrice: number | null;
  earnestMoney: number | null;
  closingDate: string | null;
  financingType: "conventional" | "fha" | "va" | "cash" | "other" | null;
  downPayment: { amount: number; isPercentage: boolean } | null;
  sellerPaidClosingCosts: { hasClosingCosts: boolean; amount?: number | null; isPercentage?: boolean | null } | null;
  inspection: { hasInspection: boolean; days?: number | null } | null;
  escalationClause: { hasEscalation: boolean; increment?: number | null; maxPrice?: number | null } | null;
  materialDefectClause: { hasMaterialDefect: boolean; amount?: number | null } | null;
  appraisalGuarantee: { hasGuarantee: boolean; amount?: number | null } | null;
  offerDeadline: { hasDeadline: boolean; deadline?: string | null } | null;
  writtenStatementClause: { hasWrittenStatement: boolean; date?: string | null; beforeClosingEarnestMoneyRecipient?: Payer | null; afterClosingEarnestMoneyRecipient?: Payer | null } | null;
  saleContingency: { isContingent: boolean; salePropertyAddress?: string | null; salePeriodDays?: number | null } | null;
  fhaReinspectionFeePayer: Payer | null;
  vaReinspectionFeePayer: Payer | null;
  vaFundingFeePayment: "buyer_at_closing" | "buyer_added_to_mortgage" | "seller" | null;
  buyerBrokerCompensation: number | null;
  appliancesIncluded: { allIncluded: boolean; excluded: string[] } | null;
  additionalNotes: string | null;
};

export const EMPTY_OFFER: OfferData = {
  propertyAddress: null, purchasePrice: null, earnestMoney: null, closingDate: null, financingType: null, downPayment: null,
  sellerPaidClosingCosts: null, inspection: null, escalationClause: null, materialDefectClause: null, appraisalGuarantee: null,
  offerDeadline: null, writtenStatementClause: null, saleContingency: null, fhaReinspectionFeePayer: null, vaReinspectionFeePayer: null,
  vaFundingFeePayment: null, buyerBrokerCompensation: null, appliancesIncluded: null, additionalNotes: null,
};

/** The terms Relay always asks for (optional clauses are never prompted). */
export const REQUIRED: [keyof OfferData, string][] = [
  ["propertyAddress", "Property"], ["purchasePrice", "Purchase Price"], ["earnestMoney", "Earnest Money"], ["closingDate", "Closing Date"],
  ["inspection", "Inspection"], ["sellerPaidClosingCosts", "Seller-Paid Closing Costs"], ["financingType", "Financing"],
  ["downPayment", "Down Payment"], ["buyerBrokerCompensation", "Buyer Broker Compensation"], ["appliancesIncluded", "Appliances Not Included"],
];

/** Labels of required terms not answered yet ("no inspection" counts as an answer). */
export function missingTerms(o: OfferData): string[] {
  return REQUIRED.filter(([k]) => {
    if (k === "appliancesIncluded") return !o.appliancesIncluded || (!o.appliancesIncluded.allIncluded && o.appliancesIncluded.excluded.length === 0);
    return o[k] == null;
  }).map(([, l]) => l);
}

/** Written statement clause on, but its date or who gets the earnest money is still missing. */
export const writtenStatementIncomplete = (o: OfferData) => {
  const w = o.writtenStatementClause;
  return !!w?.hasWrittenStatement && (!w.date || !w.beforeClosingEarnestMoneyRecipient || !w.afterClosingEarnestMoneyRecipient);
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const payer = (v: unknown): Payer | null => (v === "buyer" || v === "seller" ? v : null);

/**
 * Cleans what Claude returned into a complete offer, with Relay's defaults: unmentioned optional clauses
 * read "No", $0 closing costs when there are none, and FHA/VA-only terms cleared for other loans.
 */
export function normalizeOffer(raw: unknown): OfferData {
  const r = obj(raw) ?? {};
  const fin = ["conventional", "fha", "va", "cash", "other"].includes(r.financingType as string) ? (r.financingType as OfferData["financingType"]) : null;
  const dp = obj(r.downPayment), sc = obj(r.sellerPaidClosingCosts), insp = obj(r.inspection), esc = obj(r.escalationClause);
  const md = obj(r.materialDefectClause), ag = obj(r.appraisalGuarantee), dl = obj(r.offerDeadline), ws = obj(r.writtenStatementClause);
  const sale = obj(r.saleContingency), app = obj(r.appliancesIncluded);
  const wsOn = ws?.hasWrittenStatement === true;
  const scOn = sc?.hasClosingCosts === true;
  return {
    propertyAddress: str(r.propertyAddress),
    purchasePrice: num(r.purchasePrice),
    earnestMoney: num(r.earnestMoney),
    closingDate: str(r.closingDate, 60),
    financingType: fin,
    downPayment: dp && num(dp.amount) != null ? { amount: num(dp.amount)!, isPercentage: dp.isPercentage === true } : null,
    sellerPaidClosingCosts: sc ? (scOn ? { hasClosingCosts: true, amount: num(sc.amount), isPercentage: sc.isPercentage === true } : { hasClosingCosts: false, amount: 0, isPercentage: false }) : null,
    inspection: insp ? { hasInspection: insp.hasInspection === true, days: insp.hasInspection === true ? num(insp.days) : null } : null,
    escalationClause: esc?.hasEscalation === true ? { hasEscalation: true, increment: num(esc.increment), maxPrice: num(esc.maxPrice) } : { hasEscalation: false, increment: null, maxPrice: null },
    materialDefectClause: md?.hasMaterialDefect === true ? { hasMaterialDefect: true, amount: num(md.amount) } : { hasMaterialDefect: false, amount: null },
    appraisalGuarantee: ag?.hasGuarantee === true ? { hasGuarantee: true, amount: num(ag.amount) } : { hasGuarantee: false, amount: null },
    offerDeadline: dl?.hasDeadline === true ? { hasDeadline: true, deadline: str(dl.deadline, 80) } : { hasDeadline: false, deadline: null },
    writtenStatementClause: wsOn
      ? { hasWrittenStatement: true, date: str(ws!.date, 60), beforeClosingEarnestMoneyRecipient: payer(ws!.beforeClosingEarnestMoneyRecipient), afterClosingEarnestMoneyRecipient: payer(ws!.afterClosingEarnestMoneyRecipient) }
      : { hasWrittenStatement: false, date: null, beforeClosingEarnestMoneyRecipient: null, afterClosingEarnestMoneyRecipient: null },
    saleContingency: sale?.isContingent === true ? { isContingent: true, salePropertyAddress: str(sale.salePropertyAddress), salePeriodDays: num(sale.salePeriodDays) } : { isContingent: false, salePropertyAddress: null, salePeriodDays: null },
    fhaReinspectionFeePayer: fin === "fha" ? payer(r.fhaReinspectionFeePayer) : null,
    vaReinspectionFeePayer: fin === "va" ? payer(r.vaReinspectionFeePayer) : null,
    vaFundingFeePayment: fin === "va" && ["buyer_at_closing", "buyer_added_to_mortgage", "seller"].includes(r.vaFundingFeePayment as string) ? (r.vaFundingFeePayment as OfferData["vaFundingFeePayment"]) : null,
    buyerBrokerCompensation: num(r.buyerBrokerCompensation),
    appliancesIncluded: app ? { allIncluded: app.allIncluded === true, excluded: Array.isArray(app.excluded) ? app.excluded.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 60)).slice(0, 20) : [] } : null,
    additionalNotes: str(r.additionalNotes, 2000),
  };
}

const money = (v: number | null | undefined) => (v == null ? "N/A" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v));
const FIN: Record<string, string> = { conventional: "Conventional", fha: "FHA", va: "VA", cash: "Cash", other: "Other" };
const who = (p: Payer | null | undefined) => (p === "buyer" ? "Buyer" : p === "seller" ? "Seller" : "N/A");
const yn = (b: boolean | null | undefined) => (b ? "Yes" : "No");

/** How each term reads on the review cards (the same wording as Relay). */
export function termText(o: OfferData, key: keyof OfferData): string {
  switch (key) {
    case "propertyAddress": return o.propertyAddress ?? "—";
    case "purchasePrice": return o.purchasePrice == null ? "—" : money(o.purchasePrice);
    case "earnestMoney": return o.earnestMoney == null ? "—" : money(o.earnestMoney);
    case "closingDate": return o.closingDate ?? "—";
    case "inspection": return !o.inspection ? "—" : !o.inspection.hasInspection ? "No" : o.inspection.days != null ? `Yes — ${o.inspection.days} calendar days` : "Yes";
    case "sellerPaidClosingCosts": { const c = o.sellerPaidClosingCosts; return !c ? "—" : !c.hasClosingCosts ? "$0" : c.amount == null ? "Yes (amount TBD)" : c.isPercentage ? `${c.amount}%` : money(c.amount); }
    case "financingType": return o.financingType ? FIN[o.financingType] : "—";
    case "downPayment": return !o.downPayment ? "—" : o.downPayment.isPercentage ? `${o.downPayment.amount}%` : money(o.downPayment.amount);
    case "buyerBrokerCompensation": return o.buyerBrokerCompensation == null ? "—" : `${o.buyerBrokerCompensation}%`;
    case "appliancesIncluded": { const a = o.appliancesIncluded; return !a ? "—" : a.allIncluded ? "None" : a.excluded.length ? a.excluded.join(", ") : "—"; }
    case "escalationClause": return o.escalationClause?.hasEscalation ? `Yes — ${o.escalationClause.increment != null ? money(o.escalationClause.increment) : "?"} increments, cap ${o.escalationClause.maxPrice != null ? money(o.escalationClause.maxPrice) : "?"}` : "No";
    case "materialDefectClause": return o.materialDefectClause?.hasMaterialDefect ? (o.materialDefectClause.amount ? `Yes — ${money(o.materialDefectClause.amount)}` : "Yes") : "No";
    case "appraisalGuarantee": return o.appraisalGuarantee?.hasGuarantee ? (o.appraisalGuarantee.amount ? `Yes — up to ${money(o.appraisalGuarantee.amount)}` : "Yes") : "No";
    case "offerDeadline": return o.offerDeadline?.hasDeadline ? o.offerDeadline.deadline ?? "Yes (time TBD)" : "No";
    case "writtenStatementClause": { const w = o.writtenStatementClause; return w?.hasWrittenStatement ? `Yes — ${w.date ?? "Date needed"}; before closing: ${w.beforeClosingEarnestMoneyRecipient ? who(w.beforeClosingEarnestMoneyRecipient) : "Needed"}; after closing: ${w.afterClosingEarnestMoneyRecipient ? who(w.afterClosingEarnestMoneyRecipient) : "Needed"}` : "No"; }
    case "saleContingency": { const s = o.saleContingency; return s?.isContingent ? ["Yes", s.salePropertyAddress, s.salePeriodDays ? `${s.salePeriodDays} days` : null].filter(Boolean).join(" — ") : "No"; }
    default: return "";
  }
}

export const OPTIONAL: [keyof OfferData, string][] = [
  ["escalationClause", "Escalation"], ["materialDefectClause", "Material Defect"], ["appraisalGuarantee", "Appraisal Guarantee"],
  ["offerDeadline", "Offer Expiration"], ["writtenStatementClause", "Written Statement"], ["saleContingency", "Sale Contingency"],
];

/** The note body, in Relay's "RELAY: OFFER INSTRUCTIONS" format (what Alyssa writes the offer from). */
export function offerSummary(o: OfferData): string {
  const na = "N/A";
  const insp = o.inspection?.hasInspection ?? false;
  const esc = o.escalationClause?.hasEscalation ?? false, md = o.materialDefectClause?.hasMaterialDefect ?? false;
  const ag = o.appraisalGuarantee?.hasGuarantee ?? false, exp = o.offerDeadline?.hasDeadline ?? false;
  const ws = o.writtenStatementClause?.hasWrittenStatement ?? false, sale = o.saleContingency?.isContingent ?? false;
  const costs = o.sellerPaidClosingCosts;
  const appliances = !o.appliancesIncluded ? [na] : o.appliancesIncluded.allIncluded ? ["NONE"] : o.appliancesIncluded.excluded.length ? o.appliancesIncluded.excluded.map((a) => `${a.toUpperCase()} NOT INCLUDED`) : [na];
  const vaFee = { buyer_at_closing: "Paid by Buyer at closing", buyer_added_to_mortgage: "Paid by Buyer and added to mortgage", seller: "Paid by Seller" } as const;
  return [
    "RELAY: OFFER INSTRUCTIONS", "",
    `PROPERTY: ${o.propertyAddress ?? na}`, "",
    "TERMS:", "",
    `PURCHASE PRICE: ${money(o.purchasePrice)}`,
    `EARNEST MONEY: ${money(o.earnestMoney)}`,
    `CLOSING DATE: ${o.closingDate ?? na}`,
    `INSPECTION: ${yn(insp)}`,
    `INSPECTION PERIOD: ${insp ? (o.inspection?.days != null ? `${o.inspection.days} calendar days` : na) : na}`,
    `SELLER-PAID CLOSING COSTS: ${!costs ? na : !costs.hasClosingCosts ? "$0" : costs.amount == null ? "Yes (amount TBD)" : costs.isPercentage ? `${costs.amount}%` : money(costs.amount)}`,
    `FINANCING: ${o.financingType ? FIN[o.financingType] : na}`,
    `DOWN PAYMENT: ${!o.downPayment ? na : o.downPayment.isPercentage ? `${o.downPayment.amount}%` : money(o.downPayment.amount)}`,
    `BUYER BROKER COMPENSATION: ${o.buyerBrokerCompensation != null ? `${o.buyerBrokerCompensation}%` : na}`, "",
    "OPTIONAL CLAUSES:", "",
    `ESCALATION CLAUSE: ${yn(esc)}`,
    `ESCALATION CLAUSE INCREMENTS + CAP: ${esc ? `${o.escalationClause?.increment != null ? money(o.escalationClause.increment) : "?"} + ${o.escalationClause?.maxPrice != null ? money(o.escalationClause.maxPrice) : "?"}` : na}`,
    `MATERIAL DEFECT CLAUSE: ${yn(md)}`,
    `MATERIAL DEFECT AMOUNT: ${md && o.materialDefectClause?.amount != null ? money(o.materialDefectClause.amount) : na}`,
    `APPRAISAL GUARANTEE CLAUSE: ${yn(ag)}`,
    `APPRAISAL GUARANTEE AMOUNT: ${ag && o.appraisalGuarantee?.amount != null ? money(o.appraisalGuarantee.amount) : na}`,
    `WRITTEN STATEMENT CLAUSE: ${yn(ws)}`,
    `WRITTEN STATEMENT DATE: ${ws ? o.writtenStatementClause?.date ?? na : na}`,
    `IF SELLER CANCELS BEFORE CLOSING, EARNEST MONEY REFUNDED TO: ${ws ? who(o.writtenStatementClause?.beforeClosingEarnestMoneyRecipient) : na}`,
    `IF SELLER CANCELS AFTER CLOSING, EARNEST MONEY REFUNDED TO: ${ws ? who(o.writtenStatementClause?.afterClosingEarnestMoneyRecipient) : na}`, "",
    "OPTIONAL TERMS:",
    `SALE CONTINGENCY: ${yn(sale)}`,
    `SALE PROPERTY ADDRESS: ${sale ? o.saleContingency?.salePropertyAddress ?? na : na}`,
    `SALE CONTINGENCY PERIOD: ${sale && o.saleContingency?.salePeriodDays != null ? `${o.saleContingency.salePeriodDays} days` : na}`, "",
    "APPLIANCES NOT INCLUDED:", ...appliances, "",
    `OFFER EXPIRATION: ${yn(exp)}`,
    `EXPIRATION DATE & TIME: ${exp ? o.offerDeadline?.deadline ?? na : na}`,
    ...(o.additionalNotes?.trim() ? ["", "ADDITIONAL NOTES:", o.additionalNotes.trim()] : []),
    ...(o.financingType === "fha" ? ["", "FHA TERMS:", `WHO PAYS REINSPECTION FEE: ${who(o.fhaReinspectionFeePayer)}`, "LENDER PROCESSING FEES: $0"] : []),
    ...(o.financingType === "va" ? ["", "VA TERMS:", `WHO PAYS REINSPECTION FEE: ${who(o.vaReinspectionFeePayer)}`, "LENDER PROCESSING FEES: $0", `DVA FUNDING FEE: ${o.vaFundingFeePayment ? vaFee[o.vaFundingFeePayment] : na}`] : []),
  ].join("\n");
}

/** "September 18, 2026" (or "2026-09-18") → "2026-09-18"; anything else → "". */
export function isoDay(text: string | null | undefined): string {
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const d = new Date(text.replace(/\b(CT|CST|CDT)\b/g, "").trim());
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** What an accepted offer fills in on the purchase agreement form (by question key). */
export function paPrefill(o: OfferData): Record<string, string> {
  const out: Record<string, string> = {};
  if (o.propertyAddress) out.address = o.propertyAddress;
  if (o.purchasePrice != null) out.price = String(o.purchasePrice);
  if (o.earnestMoney != null) out.em = String(o.earnestMoney);
  const c = o.sellerPaidClosingCosts;
  if (c && !c.hasClosingCosts) out.sc = "0";
  else if (c?.amount != null) out.sc = String(c.isPercentage ? (o.purchasePrice != null ? Math.round((o.purchasePrice * c.amount) / 100) : "") : c.amount);
  const closing = isoDay(o.closingDate);
  if (closing) out.closing = closing;
  if (o.financingType) out.fin = FIN[o.financingType];
  out.defect = o.materialDefectClause?.hasMaterialDefect ? "Yes" : "No";
  const w = o.writtenStatementClause;
  if (w && !w.hasWrittenStatement) out.writtenStatement_na = "yes";
  else if (w?.date && isoDay(w.date)) out.writtenStatement = isoDay(w.date);
  if (out.sc === "") delete out.sc;
  return out;
}
