// Purchase agreements (SPEC.md §7.4): editable form definitions, "Show only if" rules, cleaning answers,
// key dates and the Under Contract column. Pure, unit tested in pa.test.ts.

export type Side = "buyer" | "seller";
export type FieldType = "text" | "money" | "number" | "pct" | "date" | "date-na" | "datetime" | "yesno" | "choice";
export type PaField = { key: string; label: string; type: FieldType; hint?: string; required?: boolean; options?: string[]; showIf?: string };
export type PaSection = { id: string; name: string; showIf?: string; people?: boolean; fields: PaField[] };

export const FIELD_TYPES: [FieldType, string][] = [["text", "Text"], ["money", "Money"], ["number", "Number"], ["pct", "Percent"], ["date", "Date"], ["date-na", "Date or N/A"], ["datetime", "Date and time"], ["yesno", "Yes/No"], ["choice", "Dropdown"]];

/** Keys the app reads (Pipeline, calendar, templates). Address and price can't be removed. */
export const AUTOMATION_KEYS = ["address", "price", "ptype", "year", "hoa", "newc", "fin", "commission", "bac", "em", "sc", "closing", "finalAcceptance", "inspection", "writtenStatement", "hoaRescission", "inspAppt"];
export const LOCKED_KEYS = ["address", "price"];
export const COMMISSION_KEYS = ["commission", "bac"];

export const KEY_DATES = [
  ["finalAcceptance", "Final Acceptance"], ["inspection", "Inspection deadline"], ["writtenStatement", "Written Statement"], ["hoaRescission", "HOA doc rescission"], ["closing", "Closing"],
] as const;
export type DateKey = (typeof KEY_DATES)[number][0];
export type DateStatus = "pending" | "met" | "waived" | "extended";

const f = (key: string, label: string, type: FieldType, extra: Partial<PaField> = {}): PaField => ({ key, label, type, ...extra });
const PROPERTY: PaSection = { id: "property", name: "The property", fields: [
  f("address", "Address", "text", { required: true, hint: "Street, city" }),
  f("ptype", "Property type", "choice", { options: ["Single family", "Townhome", "Condo", "Twin home", "Multi-family"] }),
  f("year", "Year built", "number"), f("hoa", "HOA?", "yesno"), f("newc", "New construction?", "yesno"),
] };
const DATES: PaSection = { id: "dates", name: "Key dates", fields: [
  f("closing", "Close date", "date"), f("finalAcceptance", "Final Acceptance", "date"), f("inspection", "Inspection deadline", "date"),
  f("writtenStatement", "Written Statement", "date-na"), f("hoaRescission", "HOA doc rescission", "date", { showIf: "hoa=Yes" }),
] };
const NOTES: PaSection = { id: "notes", name: "Notes", fields: [
  f("inspAppt", "Inspection appointment", "datetime"), f("referral", "Referral fee", "text"), f("emTo", "Earnest money to", "text"), f("defect", "Material defect clause?", "yesno"),
] };
const people = (id: string, name: string, fields: [string, string][]): PaSection => ({ id, name, people: true, fields: fields.map(([k, l]) => f(k, l, "text")) });
const LENDER = people("lender", "Buyer's lender", [["lenderName", "Name"], ["lenderEmail", "Email"], ["lenderCompany", "Company"]]);
const B_TITLE = people("buyerTitle", "Buyer's title", [["titleCompany", "Company"], ["titleContact", "Contact"], ["titleContactInfo", "Email/phone"]]);
const S_TITLE = people("sellerTitle", "Seller's title", [["sTitleCompany", "Company"], ["sTitleContact", "Contact"]]);

export const DEFAULT_FORMS: Record<Side, PaSection[]> = {
  buyer: [
    PROPERTY,
    { id: "contract", name: "The contract", fields: [
      f("price", "Purchase price", "money", { required: true }), f("em", "Earnest money", "money"), f("sc", "Seller contributions", "money"),
      f("commission", "Commission %", "pct"), f("bac", "BAC ($)", "money"),
    ] },
    { id: "newc", name: "Buyer New Construction", showIf: "newc=Yes", fields: [
      f("builder", "Builder", "text"), f("builderRep", "Builder rep", "text"), f("builderRepContact", "Builder rep email/phone", "text"), f("lotPlan", "Lot/plan", "text"),
      f("estCompletion", "Estimated completion", "date"), f("registered", "Buyer registered with builder?", "yesno"), f("upgrades", "Upgrades/notes", "text"),
    ] },
    DATES, NOTES, LENDER, B_TITLE,
    people("sellerAgent", "Seller's agent", [["sAgentName", "Name"], ["sAgentEmail", "Email"]]),
    people("sellerTc", "Seller's TC", [["sTcName", "Name"], ["sTcContact", "Email/phone"]]),
    S_TITLE,
  ],
  seller: [
    PROPERTY,
    { id: "contract", name: "The contract", fields: [
      f("price", "Purchase price", "money", { required: true }), f("em", "Earnest money", "money"), f("sc", "Seller contributions", "money"),
      f("fin", "Buyer's financing", "choice", { options: ["Conventional", "FHA", "VA", "Cash", "Other"] }), f("commission", "Commission %", "pct"), f("bac", "BAC ($)", "money"),
    ] },
    DATES, NOTES,
    people("buyerAgent", "Buyer's agent", [["bAgentName", "Name"], ["bAgentEmail", "Email"]]),
    LENDER, B_TITLE, S_TITLE,
  ],
};

export type Answers = Record<string, string>;

/** "newc=Yes" → shown only when that answer is Yes. */
export function isShown(rule: string | undefined, a: Answers): boolean {
  if (!rule) return true;
  const i = rule.indexOf("=");
  return (a[rule.slice(0, i)] ?? "") === rule.slice(i + 1);
}
export const visibleSections = (form: PaSection[], a: Answers) => form.filter((s) => isShown(s.showIf, a)).map((s) => ({ ...s, fields: s.fields.filter((x) => isShown(x.showIf, a)) }));

export type CleanPa = {
  address: string; price: number; answers: Answers;
  dates: Record<DateKey, string | null>; writtenStatementNA: boolean;
  commission: { commission: string; bac: string };
};

/** Validates answers against the form. Hidden questions are dropped. Throws a plain message. */
export function cleanPaAnswers(form: PaSection[], raw: Answers, opts: { skipCommission?: boolean } = {}): CleanPa {
  const answers: Answers = {};
  const dates = Object.fromEntries(KEY_DATES.map(([k]) => [k, null])) as Record<DateKey, string | null>;
  const commission = { commission: "", bac: "" };
  let address = "", price = 0, writtenStatementNA = false;
  for (const fld of visibleSections(form, raw).flatMap((s) => s.fields)) {
    if (opts.skipCommission && COMMISSION_KEYS.includes(fld.key)) continue;
    let v = (raw[fld.key] ?? "").toString().trim();
    if (fld.type === "date-na" && raw[`${fld.key}_na`] === "yes") { if (fld.key === "writtenStatement") writtenStatementNA = true; else answers[`${fld.key}_na`] = "yes"; continue; }
    if (!v) { if (fld.required) throw new Error(`Add the ${fld.label.toLowerCase()}.`); continue; }
    if (fld.type === "money" || fld.type === "number") {
      const n = Number(v.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new Error(`${fld.label}: use a number.`);
      v = String(Math.round(n));
    }
    if (fld.type === "pct") {
      const n = Number(v.replace(/[%\s]/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${fld.label}: use a percent, like 2.7.`);
      v = String(n);
    }
    if ((fld.type === "date" || fld.type === "date-na") && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${fld.label}: pick a date.`);
    if (fld.type === "datetime" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error(`${fld.label}: pick a date and time.`);
    if (fld.type === "yesno" && v !== "Yes" && v !== "No") throw new Error(`${fld.label}: pick Yes or No.`);
    if (fld.type === "choice" && !(fld.options ?? []).includes(v)) throw new Error(`${fld.label}: pick one of the choices.`);
    v = v.slice(0, 300);
    if (fld.key === "address") address = v;
    else if (fld.key === "price") price = Number(v);
    else if (fld.key in dates) dates[fld.key as DateKey] = v;
    else if (COMMISSION_KEYS.includes(fld.key)) commission[fld.key as "commission" | "bac"] = v;
    else answers[fld.key] = v;
  }
  if (!address) throw new Error("Add the address.");
  if (!price) throw new Error("Add the purchase price.");
  return { address, price, answers, dates, writtenStatementNA, commission };
}

/** Which key dates apply: Written Statement unless N/A, HOA rescission only with an HOA. */
export function applicableDates(pa: { answers: Answers; writtenStatementNA: boolean }): DateKey[] {
  return KEY_DATES.map(([k]) => k).filter((k) => (k === "writtenStatement" ? !pa.writtenStatementNA : k === "hoaRescission" ? pa.answers.hoa === "Yes" : true));
}

/** A pending or extended date that has passed counts as met. */
export function effectiveStatus(date: string | null, stored: DateStatus | undefined, today: string): DateStatus {
  const s = stored ?? "pending";
  if ((s === "pending" || s === "extended") && date && date < today) return "met";
  return s;
}

/** Under Contract column: the first whose date is still open; with nothing open, the last (SPEC.md §7.2). */
export function ucColumn<T extends { untilDate: string | null }>(
  columns: T[], pa: { answers: Answers; writtenStatementNA: boolean; dates: Record<DateKey, string | null>; dateStatus: Partial<Record<DateKey, DateStatus>> }, today: string,
): T | undefined {
  const open = new Set(applicableDates(pa).filter((k) => !["met", "waived"].includes(effectiveStatus(pa.dates[k], pa.dateStatus[k], today))));
  return columns.find((c) => c.untilDate && open.has(c.untilDate as DateKey)) ?? columns[columns.length - 1];
}

/** "2.7% · $8,424" */
export function commissionLine(pct: string, price: number): string {
  const n = Number(pct);
  if (!pct || !Number.isFinite(n)) return "";
  return `${n}% · $${Math.round((price * n) / 100).toLocaleString("en-US")}`;
}

/** Checks an edited form definition before saving. Returns a plain message or null. */
export function formProblem(form: PaSection[]): string | null {
  const keys = form.flatMap((s) => s.fields.map((x) => x.key));
  for (const k of LOCKED_KEYS) if (!keys.includes(k)) return `The ${k === "price" ? "purchase price" : "address"} question can't be removed.`;
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) return `Two questions use the same key "${dup}".`;
  for (const s of form) {
    if (!s.name.trim()) return "Every section needs a name.";
    for (const x of s.fields) {
      if (!x.label.trim()) return `A question in "${s.name}" needs a name.`;
      if (x.type === "choice" && !(x.options ?? []).length) return `"${x.label}" needs dropdown choices.`;
    }
  }
  if (form[0] && !form[0].fields.some((x) => x.key === "address")) return "Keep the address in the first section.";
  return null;
}

/** Question to pick in "Show only if": Yes/No and dropdown questions, with each answer. */
export function showIfChoices(form: PaSection[]): [string, string][] {
  return form.flatMap((s) => s.fields).flatMap((x) =>
    x.type === "yesno" ? (["Yes", "No"] as const).map((o): [string, string] => [`${x.key}=${o}`, `${x.label} is ${o}`])
    : x.type === "choice" ? (x.options ?? []).map((o): [string, string] => [`${x.key}=${o}`, `${x.label} is ${o}`]) : []);
}

// ---------- What a viewer receives ----------
export type PaView = {
  id: string; fileId: string; side: Side; state: "active" | "closed" | "fell_through"; address: string; price: number; answers: Answers;
  dates: Record<DateKey, string | null>; writtenStatementNA: boolean; dateStatus: Partial<Record<DateKey, DateStatus>>; originalDates: Partial<Record<DateKey, string>>;
  endedOn: string | null; commission: string | null; bac: string | null;
};

type DbPa = {
  id: string; fileId: string; side: string; state: string; address: string; price: number; answers: unknown; writtenStatementNA: boolean; dateStatus: unknown; originalDates: unknown;
  finalAcceptance: Date | null; inspection: Date | null; writtenStatement: Date | null; hoaRescission: Date | null; closing: Date | null; endedOn: Date | null;
  commission?: { commission: string; bac: string } | null;
};
const obj = <T,>(v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T));

/** Commission % and BAC are null unless the viewer has "See commissions". */
export function toPaView(p: DbPa, canSeeCommission: boolean): PaView {
  return {
    id: p.id, fileId: p.fileId, side: p.side === "seller" ? "seller" : "buyer", state: p.state as PaView["state"], address: p.address, price: p.price,
    answers: obj<Answers>(p.answers),
    dates: Object.fromEntries(KEY_DATES.map(([k]) => [k, p[k] ? (p[k] as Date).toISOString().slice(0, 10) : null])) as Record<DateKey, string | null>,
    writtenStatementNA: p.writtenStatementNA, dateStatus: obj(p.dateStatus), originalDates: obj(p.originalDates),
    endedOn: p.endedOn ? p.endedOn.toISOString().slice(0, 10) : null,
    commission: canSeeCommission ? p.commission?.commission ?? "" : null,
    bac: canSeeCommission ? p.commission?.bac ?? "" : null,
  };
}

