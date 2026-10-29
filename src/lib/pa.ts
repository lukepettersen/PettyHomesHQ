// Purchase agreements (SPEC.md §7.4): editable form definitions, "Show only if" rules, cleaning answers,
// key dates and the Under Contract column. Pure, unit tested in pa.test.ts.

export type Side = "buyer" | "seller";
export type FieldType = "text" | "money" | "number" | "pct" | "date" | "date-na" | "datetime" | "yesno" | "choice" | "client" | "moneypct";
export type PaField = { key: string; label: string; type: FieldType; hint?: string; required?: boolean; options?: string[]; showIf?: string };
export type PaSection = { id: string; name: string; showIf?: string; people?: boolean; fields: PaField[] };

export const FIELD_TYPES: [FieldType, string][] = [["text", "Text"], ["money", "Money"], ["number", "Number"], ["pct", "Percent"], ["date", "Date"], ["date-na", "Date or N/A"], ["datetime", "Date and time"], ["yesno", "Yes/No"], ["choice", "Dropdown"], ["moneypct", "Money or %"]];
/** Purchase agreement forms also offer a dropdown of the client's first names (e.g. Earnest money to). */
export const PA_FIELD_TYPES: [FieldType, string][] = [...FIELD_TYPES, ["client", "Client name"]];

/** Keys the app reads (Pipeline, calendar, templates). Address and price can't be removed. */
export const AUTOMATION_KEYS = ["address", "price", "ptype", "year", "hoa", "newc", "defect", "fin", "commission", "bac", "em", "sc", "closing", "finalAcceptance", "inspection", "writtenStatement", "hoaRescission", "inspAppt"];
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
  f("inspAppt", "Inspection appointment", "datetime"),
  f("referral", "Referral fee", "yesno"), f("referralPct", "Referral %", "pct", { showIf: "referral=Yes" }), f("referralTo", "Referral to", "text", { showIf: "referral=Yes" }),
  f("emTo", "Earnest money to", "client"),
  f("defect", "Material defect clause?", "yesno"), f("defectAmount", "Material defect amount", "money", { showIf: "defect=Yes" }),
] };

/** Client first names for "Client name" questions: "Emma Sharpe & Vy Nguyen" → ["Emma", "Vy"]. */
export const clientFirstNames = (personName: string) =>
  personName.split(/\s*&\s*|\s+and\s+|\s*\+\s*/i).map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);

/**
 * One-time upgrade of a saved form (owner request 2026-10-26): Referral fee and Material defect become Yes/No with
 * follow-ups (referral % and who; defect amount), Earnest money to becomes a client-name dropdown.
 * Finds each by key or by its name. Returns null when there's nothing to change.
 */
export function upgradeNotesForm(form: PaSection[]): { form: PaSection[]; referral?: string; defect?: string } | null {
  const keys = new Set(form.flatMap((s) => s.fields.map((x) => x.key)));
  const find = (key: string, label: RegExp) => form.flatMap((s) => s.fields).find((x) => x.key === key || label.test(x.label));
  const referral = find("referral", /referral fee/i), defect = find("defect", /material defect/i), emTo = find("emTo", /earnest money to/i);
  let changed = false;
  const out = form.map((s) => ({ ...s, fields: s.fields.flatMap((x): PaField[] => {
    if (x === referral && !keys.has("referralPct")) {
      changed = true;
      return [{ ...x, type: "yesno", options: undefined }, f("referralPct", "Referral %", "pct", { showIf: `${x.key}=Yes` }), f("referralTo", "Referral to", "text", { showIf: `${x.key}=Yes` })];
    }
    if (x === defect && !keys.has("defectAmount")) {
      changed = true;
      return [{ ...x, type: "yesno", options: undefined }, f("defectAmount", "Material defect amount", "money", { showIf: `${x.key}=Yes` })];
    }
    if (x === emTo && x.type === "text") { changed = true; return [{ ...x, type: "client" }]; }
    return [x];
  }) }));
  return changed ? { form: out, referral: referral?.key, defect: defect?.key } : null;
}

/** Answers typed before the upgrade: "25% to Jim" keeps as Referral to with Yes; a defect amount moves to its own question. */
export function upgradeNotesAnswers(a: Answers, keys: { referral?: string; defect?: string }): Answers | null {
  const n = { ...a };
  const r = keys.referral && (a[keys.referral] ?? "").trim();
  if (keys.referral && r && r !== "Yes" && r !== "No") {
    n[keys.referral] = "Yes";
    const pct = r.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pct && !n.referralPct) n.referralPct = pct[1];
    if (!n.referralTo) n.referralTo = r;
  }
  const d = keys.defect && (a[keys.defect] ?? "").trim();
  if (keys.defect && d && d !== "Yes" && d !== "No") {
    n[keys.defect] = /^(no|none|n\/a)$/i.test(d) ? "No" : "Yes";
    const amt = d.replace(/[$,\s]/g, "");
    if (n[keys.defect] === "Yes" && !n.defectAmount) n.defectAmount = /^\d+(\.\d+)?$/.test(amt) ? String(Math.round(Number(amt))) : d;
  }
  return JSON.stringify(n) === JSON.stringify(a) ? null : n;
}
const people = (id: string, name: string, fields: [string, string][]): PaSection => ({ id, name, people: true, fields: fields.map(([k, l]) => f(k, l, "text")) });
const LENDER = people("lender", "Buyer's lender", [["lenderName", "Name"], ["lenderEmail", "Email"], ["lenderCompany", "Company"]]);
const B_TITLE = people("buyerTitle", "Buyer's title", [["titleCompany", "Company"], ["titleContact", "Contact"], ["titleContactInfo", "Email/phone"]]);
const S_TITLE = people("sellerTitle", "Seller's title", [["sTitleCompany", "Company"], ["sTitleContact", "Contact"]]);

export const DEFAULT_FORMS: Record<Side, PaSection[]> = {
  buyer: [
    PROPERTY,
    { id: "contract", name: "The contract", fields: [
      f("price", "Purchase price", "money", { required: true }), f("em", "Earnest money", "money"), f("sc", "Seller contributions", "moneypct"),
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
      f("price", "Purchase price", "money", { required: true }), f("em", "Earnest money", "money"), f("sc", "Seller contributions", "moneypct"),
      f("fin", "Buyer's financing", "choice", { options: ["Conventional", "FHA", "VA", "Cash", "Other"] }), f("commission", "Commission %", "pct"), f("bac", "BAC ($)", "money"),
    ] },
    DATES, NOTES,
    people("buyerAgent", "Buyer's agent", [["bAgentName", "Name"], ["bAgentEmail", "Email"]]),
    LENDER, B_TITLE, S_TITLE,
  ],
};

export type Answers = Record<string, string>;

/** "Money or %" answers (owner request 2026-10-26: seller paids are sometimes $, sometimes %): "3%" stays a percent, anything else is dollars. */
export function cleanMoneyOrPct(v: string, label: string): string {
  if (/%\s*$/.test(v)) {
    const n = Number(v.replace(/[%\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label}: use a percent, like 3.`);
    return `${n}%`;
  }
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}: use a dollar amount or a percent.`);
  return String(Math.round(n));
}

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
    if (fld.type === "moneypct") v = cleanMoneyOrPct(v, fld.label);
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
/** A key date's status. Dates only count as met when someone marks them (Mark pending, or the date picker), never just
 *  because they passed (owner 2026-10-29); Final Acceptance is the exception, met once it's in the past. */
export function effectiveStatus(date: string | null, stored: DateStatus | undefined, today: string, key?: DateKey): DateStatus {
  const s = stored ?? "pending";
  if (key === "finalAcceptance" && (s === "pending" || s === "extended") && date && date < today) return "met";
  return s;
}

/** Under Contract column: the first whose date is still open; with nothing open, the last (SPEC.md §7.2). */
export function ucColumn<T extends { untilDate: string | null }>(
  columns: T[], pa: { answers: Answers; writtenStatementNA: boolean; dates: Record<DateKey, string | null>; dateStatus: Partial<Record<DateKey, DateStatus>> }, today: string,
): T | undefined {
  const open = new Set(applicableDates(pa).filter((k) => !["met", "waived"].includes(effectiveStatus(pa.dates[k], pa.dateStatus[k], today, k))));
  return columns.find((c) => c.untilDate && open.has(c.untilDate as DateKey)) ?? columns[columns.length - 1];
}

/** The dates a contract must get past to reach the last Under Contract column ("Pending"): each earlier column's "until" date. */
export function pendingKeys(columns: { untilDate: string | null }[]): DateKey[] {
  return columns.slice(0, -1).map((c) => c.untilDate).filter((k): k is DateKey => KEY_DATES.some(([x]) => x === k));
}

/** Pending = every date before the Pending column is marked met or waived. */
export function isPending(pa: { answers: Answers; writtenStatementNA: boolean; dates: Record<DateKey, string | null>; dateStatus: Partial<Record<DateKey, DateStatus>> }, keys: DateKey[], today: string): boolean {
  const apply = new Set(applicableDates(pa));
  return keys.filter((k) => apply.has(k)).every((k) => ["met", "waived"].includes(effectiveStatus(pa.dates[k], pa.dateStatus[k], today, k)));
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
  partners: Record<string, { id: string; name: string; email?: string; phone?: string }>; // people section → the contact picked for it (first email and phone)
};

type DbPa = {
  id: string; fileId: string; side: string; state: string; address: string; price: number; answers: unknown; writtenStatementNA: boolean; dateStatus: unknown; originalDates: unknown;
  finalAcceptance: Date | null; inspection: Date | null; writtenStatement: Date | null; hoaRescission: Date | null; closing: Date | null; endedOn: Date | null;
  commission?: { commission: string; bac: string } | null;
  partners?: { sectionId: string; person: { id: string; name: string; emails?: { address: string }[]; phones?: { number: string }[] } }[];
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
    partners: Object.fromEntries((p.partners ?? []).map((x) => [x.sectionId, { id: x.person.id, name: x.person.name, email: x.person.emails?.[0]?.address, phone: x.person.phones?.[0]?.number }])),
  };
}

