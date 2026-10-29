// Buyer and listing files (SPEC.md §7.1): the editable forms (questions shown at each status), cleaning
// answers, and what the contact page and Pipeline show. Pure, unit tested in files.test.ts.

export type FileKind = "buyer" | "listing";
import { cleanMoneyOrPct, isShown, type FieldType, type PaField, type PaSection } from "./pa";
import { toSocialPosts, type SocialPosts } from "@/lib/social";

/** A section of the buyer or listing form; `statuses` lists the status ids it shows at (none = every status). */
export type FileSection = PaSection & { statuses?: string[] };
export type Answers = Record<string, string>;

const TIMEFRAMES = ["0–3 months", "3–6 months", "6–12 months", "12+ months"];
const q = (key: string, label: string, type: FieldType, extra: Partial<PaField> = {}): PaField => ({ key, label, type, ...extra });

const SEARCH = { id: "search", name: "What they're looking for", fields: [
  q("areas", "Areas they want", "text", { hint: "e.g. SW Minneapolis, Edina" }),
  q("range", "Price range", "text", { hint: "e.g. $350–400k" }),
  q("lender", "Lender", "text", { hint: "Name and company" }),
] };
const CONSULT = { id: "consult", name: "Consult", fields: [q("consult", "Consult date", "date")] };
const REP = { id: "rep", name: "Buyer rep", fields: [q("repSigned", "Buyer rep signed", "date"), q("repExpires", "Buyer rep expires", "date"), q("bac", "BAC", "text", { hint: "e.g. 2.5%" })] };
const OFFER = { id: "offer", name: "The offer", fields: [q("offer", "Offer (address and price)", "text", { hint: "e.g. 2215 Hillside Ave · $389,000" }), q("respond", "Response deadline", "date")] };
const HOME = { id: "home", name: "The home", fields: [q("address", "Property address", "text", { hint: "Street, city", required: true }), q("price", "Estimated value", "money"), q("timeframe", "Timeframe", "choice", { options: TIMEFRAMES })] };
const LISTING = { id: "listing", name: "The listing", fields: [
  q("address", "Property address", "text", { hint: "Street, city", required: true }), q("price", "List price", "money"),
  q("lcSigned", "Listing agreement signed", "date"), q("lcExpires", "Listing expires", "date"),
  q("commission", "Commission", "text", { hint: "e.g. 2.5%" }), q("bac", "BAC offered", "text", { hint: "e.g. 2.5%" }),
  q("photos", "Photos scheduled", "date"), q("active", "Active date", "date"),
] };
const PROPERTY = { id: "property", name: "The property", fields: [
  q("ptype", "Property type", "choice", { options: ["Single family", "Townhome", "Condo", "Twin home", "Multi-family"] }),
  q("year", "Year built", "number"), q("hoa", "HOA?", "yesno"), q("newc", "New construction?", "yesno"),
] };

/**
 * The starting forms, shown at the same statuses as before forms were editable: buyers always get the search,
 * the consult at the first status, the rep from the third, the offer at the last; listings get the home and
 * consult early, then the listing and property.
 */
export function defaultFileForm(kind: FileKind, statuses: { id: string }[]): FileSection[] {
  const ids = statuses.map((s) => s.id), at = (from: number, to = ids.length - 1) => ids.slice(Math.max(0, from), to + 1);
  if (kind === "buyer") return [{ ...SEARCH }, { ...CONSULT, statuses: at(0, 0) }, { ...REP, statuses: at(2) }, { ...OFFER, statuses: ids.length > 2 ? at(ids.length - 1) : [] }];
  // "The home" and "The listing" both ask for the address and price; they're shown at different statuses.
  return [{ ...HOME, statuses: at(0, 1) }, { ...CONSULT, statuses: at(0, 0) }, { ...LISTING, statuses: at(2) }, { ...PROPERTY, statuses: at(2) }];
}

/** Keys the app reads: Pipeline cards, the commission table, contract prefill and template conditions. */
export const FILE_AUTOMATION_KEYS = ["address", "price", "commission", "bac", "consult", "repExpires", "active", "photos", "ptype", "year", "hoa", "newc"];
export const FILE_LOCKED_KEYS: Record<FileKind, string[]> = { buyer: [], listing: ["address"] };
const COMMISSION = ["commission", "bac"];

/** Sections shown at a status (and passing any "Show only if"). */
export function sectionsAt(form: FileSection[], statusId: string | null, a: Answers = {}): FileSection[] {
  return form.filter((s) => (!s.statuses?.length || (statusId && s.statuses.includes(statusId))) && isShown(s.showIf, a))
    .map((s) => ({ ...s, fields: s.fields.filter((f) => isShown(f.showIf, a)) }));
}

export type CleanFile = { address: string | null; price: number | null; info: Answers; commission: { commission: string; bac: string }; shown: Set<string> };

/** Checks and tidies the answers to the questions shown at a status. Throws a plain message the user can fix. */
export function cleanFileAnswers(form: FileSection[], statusId: string | null, raw: Answers, opts: { skipCommission?: boolean } = {}): CleanFile {
  const info: Answers = {};
  let address: string | null = null, price: number | null = null;
  const commission = { commission: "", bac: "" };
  const fields = sectionsAt(form, statusId, raw).flatMap((s) => s.fields).filter((f, i, all) => all.findIndex((x) => x.key === f.key) === i);
  const shown = new Set(fields.map((f) => f.key));
  for (const f of fields) {
    if (opts.skipCommission && COMMISSION.includes(f.key)) continue;
    let v = (raw[f.key] ?? "").toString().trim();
    if (f.type === "date-na" && raw[`${f.key}_na`] === "yes") { info[`${f.key}_na`] = "yes"; continue; }
    if (!v) { if (f.required) throw new Error(`Add the ${f.label.toLowerCase()}.`); continue; }
    if (f.type === "money" || f.type === "number") {
      const n = Number(v.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label}: use a number.`);
      v = String(Math.round(n));
    }
    if (f.type === "moneypct") v = cleanMoneyOrPct(v, f.label);
    if (f.type === "pct") { const n = Number(v.replace(/[%\s]/g, "")); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${f.label}: use a percent, like 2.7.`); v = String(n); }
    if ((f.type === "date" || f.type === "date-na") && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f.label}: pick a date.`);
    if (f.type === "datetime" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error(`${f.label}: pick a date and time.`);
    if (f.type === "yesno" && v !== "Yes" && v !== "No") throw new Error(`${f.label}: pick Yes or No.`);
    if (f.type === "choice" && !(f.options ?? []).includes(v)) throw new Error(`${f.label}: pick one of the choices.`);
    v = v.slice(0, 300);
    if (f.key === "address") address = v;
    else if (f.key === "price") price = Number(v);
    else if (COMMISSION.includes(f.key)) commission[f.key as "commission" | "bac"] = v;
    else info[f.key] = v;
  }
  return { address, price, info, commission, shown };
}

// ---------- Display ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDay = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
/** "20:00" → "8:00pm". Times always show on a 12-hour clock, Central time. */
export const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Money boxes show dollars as you type, however it's entered: "10000", "0010000.50", "$10,000" and "10k" → "$10,000". */
/** A "Money or %" answer for reading: "3%" or "$5,000". */
export const moneyOrPctShown = (v: string) => (v.trim().endsWith("%") ? v.trim() : moneyTyped(v));
/** Percent boxes show "2.7%" once you leave them: "2.7", "2.70 %" → "2.7%". */
export function pctShown(raw: string): string {
  const n = raw.replace(/[^\d.]/g, "");
  return n && Number.isFinite(Number(n)) ? `${Number(n)}%` : raw;
}
export function moneyTyped(raw: string): string {
  const short = raw.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([km])$/i);
  if (short) return money(Number(short[1]) * (short[2].toLowerCase() === "k" ? 1e3 : 1e6));
  const whole = raw.split(".")[0].replace(/\D/g, "");
  return whole ? money(Number(whole)) : "";
}
export const kMoney = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n));

/** What a viewer may see of a file. Commission and BAC are null unless allowed ("See commissions"). */
export type FileView = {
  id: string; kind: FileKind; personId: string; personName: string; statusId: string | null; status: string; statusSince: string;
  address: string | null; price: number | null; info: Answers; commission: string | null; bac: string | null; closedAt: string | null;
  notes: string; notesAt: string | null; notesBy: string | null;
  social: SocialPosts;
};

export function toFileView(
  f: { id: string; kind: string; personId: string; statusId: string | null; statusSince: Date; address: string | null; price: number | null; info: unknown; closedAt: Date | null; notes?: string; notesAt?: Date | null; notesBy?: string | null; social?: unknown; person: { name: string }; status: { name: string } | null; commission?: { commission: string; bac: string } | null },
  canSeeCommission: boolean,
): FileView {
  const info = f.info && typeof f.info === "object" && !Array.isArray(f.info) ? (f.info as Answers) : {};
  return {
    id: f.id, kind: f.kind === "listing" ? "listing" : "buyer", personId: f.personId, personName: f.person.name, statusId: f.statusId,
    status: f.closedAt ? "Closed" : f.status?.name ?? "No status", statusSince: f.statusSince.toISOString(),
    address: f.address, price: f.price, info,
    commission: canSeeCommission ? f.commission?.commission ?? "" : null,
    bac: canSeeCommission ? f.commission?.bac ?? "" : null,
    closedAt: f.closedAt ? f.closedAt.toISOString() : null,
    notes: f.notes ?? "", notesAt: f.notesAt ? f.notesAt.toISOString() : null, notesBy: f.notesBy ?? null,
    social: toSocialPosts(f.social),
  };
}

/** "Looking in Edina · $350–400k" for buyers, the address for listings. */
export const fileLine = (f: Pick<FileView, "kind" | "address" | "info">) =>
  f.kind === "buyer" ? [f.info.areas, f.info.range].filter(Boolean).join(" · ") || "Looking" : f.address ?? "Address not set";

/** Label/value pairs for the facts line, in form order. Empty values, and commission the viewer can't see, are left out. */
export function factRows(form: FileSection[], f: FileView, opts: { blanks?: boolean } = {}): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>(["address"]);
  // With blanks, unanswered questions the form asks at the deal's current status show as "—" (owner request 2026-10-29).
  const asked = new Set(opts.blanks ? sectionsAt(form, f.statusId, f.info).flatMap((s) => s.fields.map((x) => x.key)) : []);
  for (const fld of form.flatMap((s) => s.fields)) {
    if (seen.has(fld.key)) continue;
    seen.add(fld.key);
    const hidden = (fld.key === "commission" && f.commission === null) || (fld.key === "bac" && f.bac === null);
    const raw = fld.key === "price" ? (f.price ? String(f.price) : "") : fld.key === "commission" ? f.commission ?? "" : fld.key === "bac" ? f.bac ?? "" : f.info[fld.key] ?? "";
    if (!raw) { if (asked.has(fld.key) && !hidden) out.push([fld.label, "—"]); continue; }
    const label = fld.key === "price" && f.kind === "listing" ? (f.info.active || f.status === "Active" ? "List price" : fld.label) : fld.label;
    const value = fld.type === "money" ? money(Number(raw)) : fld.type === "moneypct" ? moneyOrPctShown(raw) : fld.type === "date" ? shortDay(raw) : fld.type === "datetime" ? `${shortDay(raw.slice(0, 10))} ${clock(raw.slice(11, 16))}` : fld.type === "pct" ? `${raw}%` : raw;
    out.push([label, value]);
  }
  return out;
}

/** Health dot from overdue open tasks: none on track, 1–2 something overdue, 3+ behind. */
export const health = (overdue: number): "g" | "y" | "r" => (overdue >= 3 ? "r" : overdue ? "y" : "g");
export const HEALTH_LABEL = { g: "On track", y: "Something overdue", r: "Behind" } as const;
