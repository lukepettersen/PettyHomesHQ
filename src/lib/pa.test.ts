import { describe, expect, it } from "vitest";
import { applicableDates, cleanMoneyOrPct, cleanPaAnswers, clientFirstNames, commissionLine, DEFAULT_FORMS, effectiveStatus, formProblem, ucColumn, upgradeNotesAnswers, upgradeNotesForm, visibleSections, type PaSection } from "./pa";

const buyer = DEFAULT_FORMS.buyer;
const TODAY = "2026-10-13";
const cols = [{ name: "Inspection", untilDate: "inspection" }, { name: "HOA review", untilDate: "hoaRescission" }, { name: "Financing", untilDate: "writtenStatement" }, { name: "Closing", untilDate: "closing" }];

describe("show only if", () => {
  it("shows Buyer New Construction only for new construction, HOA date only with an HOA", () => {
    const names = (a: Record<string, string>) => visibleSections(buyer, a).map((s) => s.name);
    expect(names({ newc: "No" })).not.toContain("Buyer New Construction");
    expect(names({ newc: "Yes" })).toContain("Buyer New Construction");
    const dateKeys = (a: Record<string, string>) => visibleSections(buyer, a).find((s) => s.id === "dates")!.fields.map((x) => x.key);
    expect(dateKeys({ hoa: "No" })).not.toContain("hoaRescission");
    expect(dateKeys({ hoa: "Yes" })).toContain("hoaRescission");
  });
});

describe("cleaning answers", () => {
  const raw = { address: "2215 Hillside Ave", price: "$389,000", hoa: "No", newc: "No", hoaRescission: "2026-10-30", builder: "X", commission: "2.7", bac: "8000",
    closing: "2026-11-20", inspection: "2026-10-20", writtenStatement_na: "yes", lenderName: "Pat", inspAppt: "2026-10-16T10:00" };
  it("splits typed dates, commission and the rest; drops hidden answers", () => {
    const c = cleanPaAnswers(buyer, raw);
    expect(c.address).toBe("2215 Hillside Ave");
    expect(c.price).toBe(389000);
    expect(c.dates).toEqual({ finalAcceptance: null, inspection: "2026-10-20", writtenStatement: null, hoaRescission: null, closing: "2026-11-20" });
    expect(c.writtenStatementNA).toBe(true);
    expect(c.commission).toEqual({ commission: "2.7", bac: "8000" });
    expect(c.answers).toEqual({ hoa: "No", newc: "No", lenderName: "Pat", inspAppt: "2026-10-16T10:00" });
  });
  it("leaves commission out when asked", () => {
    expect(cleanPaAnswers(buyer, raw, { skipCommission: true }).commission).toEqual({ commission: "", bac: "" });
  });
  it("needs address and price, and checks types", () => {
    expect(() => cleanPaAnswers(buyer, { price: "1" })).toThrow("Add the address.");
    expect(() => cleanPaAnswers(buyer, { address: "x", price: "1", commission: "abc" })).toThrow("Commission %: use a percent");
    expect(() => cleanPaAnswers(buyer, { address: "x", price: "1", hoa: "Maybe" })).toThrow("HOA?: pick Yes or No.");
  });
});

describe("key dates and Under Contract column", () => {
  const pa = { answers: { hoa: "Yes" }, writtenStatementNA: false, dates: { finalAcceptance: "2026-10-01", inspection: "2026-10-20", writtenStatement: "2026-11-01", hoaRescission: "2026-10-25", closing: "2026-11-20" }, dateStatus: {} };
  it("knows which dates apply", () => {
    expect(applicableDates({ answers: { hoa: "No" }, writtenStatementNA: true })).toEqual(["finalAcceptance", "inspection", "closing"]);
  });
  it("only treats a passed Final Acceptance as met; other dates wait to be marked", () => {
    expect(effectiveStatus("2026-10-01", "pending", TODAY, "finalAcceptance")).toBe("met");
    expect(effectiveStatus("2026-10-01", "pending", TODAY, "inspection")).toBe("pending");
    expect(effectiveStatus("2026-10-01", undefined, TODAY)).toBe("pending");
    expect(effectiveStatus("2026-10-20", "pending", TODAY)).toBe("pending");
    expect(effectiveStatus("2026-10-20", "waived", TODAY)).toBe("waived");
  });
  it("sits in the first column whose date is open", () => {
    expect(ucColumn(cols, pa, TODAY)!.name).toBe("Inspection");
    expect(ucColumn(cols, { ...pa, dateStatus: { inspection: "waived" } }, TODAY)!.name).toBe("HOA review");
    expect(ucColumn(cols, { ...pa, answers: { hoa: "No" }, dateStatus: { inspection: "met" } }, TODAY)!.name).toBe("Financing");
    expect(ucColumn(cols, { ...pa, dateStatus: { inspection: "met", hoaRescission: "met", writtenStatement: "met", closing: "met" } }, TODAY)!.name).toBe("Closing");
  });
});

describe("form editor checks and commission line", () => {
  it("keeps address and price", () => {
    expect(formProblem(buyer)).toBeNull();
    expect(formProblem(buyer.map((s) => ({ ...s, fields: s.fields.filter((x) => x.key !== "price") })))).toMatch(/purchase price/);
  });
  it("formats commission", () => {
    expect(commissionLine("2.7", 312000)).toBe("2.7% · $8,424");
    expect(commissionLine("", 312000)).toBe("");
  });
});

describe("commission is withheld without permission", () => {
  const row = { id: "pa1", fileId: "f1", side: "buyer", state: "active", address: "1 Main", price: 312000, answers: { hoa: "No" }, writtenStatementNA: false, dateStatus: {}, originalDates: {},
    finalAcceptance: new Date("2026-10-01T00:00:00Z"), inspection: null, writtenStatement: null, hoaRescission: null, closing: new Date("2026-11-20T00:00:00Z"), endedOn: null,
    commission: { commission: "2.7", bac: "8000" } };
  it("returns commission only to viewers who may see it", async () => {
    const { toPaView } = await import("./pa");
    expect([toPaView(row, true).commission, toPaView(row, true).bac]).toEqual(["2.7", "8000"]);
    const no = toPaView(row, false);
    expect([no.commission, no.bac]).toEqual([null, null]);
    expect(JSON.stringify(no)).not.toMatch(/2\.7|8000/);
    expect(no.dates.closing).toBe("2026-11-20");
  });
});

describe("notes upgrade (owner request 2026-10-26)", () => {
  const saved: PaSection[] = [
    { id: "property", name: "The property", fields: [{ key: "address", label: "Address", type: "text" }] },
    { id: "notes", name: "Notes", fields: [
      { key: "referral", label: "Referral fee", type: "text" }, { key: "emTo", label: "Earnest Money To", type: "text" },
      { key: "qMaterialDefect1a2b", label: "Material Defect Clause", type: "text" },
    ] },
  ];
  it("turns referral and defect into Yes/No with follow-ups and earnest money into a client dropdown", () => {
    const up = upgradeNotesForm(saved)!;
    const notes = up.form[1].fields;
    expect(notes.map((x) => [x.key, x.type, x.showIf ?? ""])).toEqual([
      ["referral", "yesno", ""], ["referralPct", "pct", "referral=Yes"], ["referralTo", "text", "referral=Yes"],
      ["emTo", "client", ""], ["qMaterialDefect1a2b", "yesno", ""], ["defectAmount", "money", "qMaterialDefect1a2b=Yes"],
    ]);
    expect(up.defect).toBe("qMaterialDefect1a2b");
    expect(upgradeNotesForm(up.form)).toBeNull();
    expect(upgradeNotesForm(DEFAULT_FORMS.buyer)).toBeNull();
  });
  it("moves earlier answers to the new questions", () => {
    const keys = { referral: "referral", defect: "qMaterialDefect1a2b" };
    expect(upgradeNotesAnswers({ referral: "25% to Jim", qMaterialDefect1a2b: "$5,000" }, keys)).toEqual({ referral: "Yes", referralPct: "25", referralTo: "25% to Jim", qMaterialDefect1a2b: "Yes", defectAmount: "5000" });
    expect(upgradeNotesAnswers({ referral: "No", qMaterialDefect1a2b: "none" }, keys)).toEqual({ referral: "No", qMaterialDefect1a2b: "No" });
    expect(upgradeNotesAnswers({ referral: "Yes" }, keys)).toBeNull();
  });
  it("lists client first names", () => {
    expect(clientFirstNames("Emma Sharpe & Vy Nguyen")).toEqual(["Emma", "Vy"]);
    expect(clientFirstNames("Sam Ortiz")).toEqual(["Sam"]);
  });
});

describe("Money or % (owner request 2026-10-26)", () => {
  it("keeps a percent as a percent and anything else as dollars", () => {
    expect(cleanMoneyOrPct("3%", "Seller contributions")).toBe("3%");
    expect(cleanMoneyOrPct("2.5 %", "Seller contributions")).toBe("2.5%");
    expect(cleanMoneyOrPct("$5,000", "Seller contributions")).toBe("5000");
    expect(() => cleanMoneyOrPct("150%", "Seller contributions")).toThrow();
  });
});
