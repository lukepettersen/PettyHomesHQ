// Buyer and listing files (SPEC.md §7.1): the questions asked at each status, cleaning answers,
// and what the contact page and Pipeline show. Pure, unit tested in files.test.ts.

export type FileKind = "buyer" | "listing";
export type QType = "text" | "money" | "number" | "date" | "choice";
export type Question = { key: string; label: string; type: QType; options?: string[]; placeholder?: string; required?: boolean; commission?: boolean };
export type Group = { title: string; questions: Question[] };

const TIMEFRAMES = ["0–3 months", "3–6 months", "6–12 months", "12+ months"];
const YES_NO = ["No", "Yes"];
const q = (key: string, label: string, type: QType, extra: Partial<Question> = {}): Question => ({ key, label, type, ...extra });

const SEARCH: Group = { title: "What they're looking for", questions: [
  q("areas", "Areas they want", "text", { placeholder: "e.g. SW Minneapolis, Edina" }),
  q("range", "Price range", "text", { placeholder: "e.g. $350–400k" }),
  q("timeframe", "Timeframe", "choice", { options: TIMEFRAMES }),
  q("preapproved", "Pre-approved?", "choice", { options: ["Not yet", "Yes", "Paying cash"] }),
  q("lender", "Lender", "text", { placeholder: "Name and company" }),
] };
const CONSULT: Group = { title: "Consult", questions: [q("consult", "Consult date", "date")] };
const REP: Group = { title: "Buyer rep", questions: [
  q("repSigned", "Buyer rep signed", "date"), q("repExpires", "Buyer rep expires", "date"),
  q("bac", "BAC", "text", { placeholder: "e.g. 2.5%", commission: true }),
] };
const OFFER: Group = { title: "The offer", questions: [
  q("offer", "Offer (address and price)", "text", { placeholder: "e.g. 2215 Hillside Ave · $389,000" }), q("respond", "Response deadline", "date"),
] };
const HOME: Group = { title: "The home", questions: [
  q("address", "Property address", "text", { placeholder: "Street, city", required: true }), q("price", "Estimated value", "money"),
  q("timeframe", "Timeframe", "choice", { options: TIMEFRAMES }),
] };
const LISTING: Group = { title: "The listing", questions: [
  q("address", "Property address", "text", { placeholder: "Street, city", required: true }), q("price", "List price", "money"),
  q("lcSigned", "Listing agreement signed", "date"), q("lcExpires", "Listing expires", "date"),
  q("commission", "Commission", "text", { placeholder: "e.g. 2.5%", commission: true }), q("bac", "BAC offered", "text", { placeholder: "e.g. 2.5%", commission: true }),
  q("photos", "Photos scheduled", "date"), q("active", "Active date", "date"),
] };
const PROPERTY: Group = { title: "The property", questions: [
  q("ptype", "Property type", "choice", { options: ["Single family", "Townhome", "Condo", "Twin home", "Multi-family"] }),
  q("year", "Year built", "number"), q("hoa", "HOA?", "choice", { options: YES_NO }), q("newc", "New construction?", "choice", { options: YES_NO }),
] };

/** Questions for a status, by its position in the (editable) status list. */
export function groupsFor(kind: FileKind, statusIndex: number, statusCount: number): Group[] {
  if (kind === "buyer") {
    const g = [SEARCH];
    if (statusIndex === 0) g.push(CONSULT);
    if (statusIndex >= 2) g.push(REP);
    if (statusIndex === statusCount - 1 && statusCount > 2) g.push(OFFER);
    return g;
  }
  if (statusIndex < 2) return statusIndex === 0 ? [HOME, CONSULT] : [HOME];
  return [LISTING, PROPERTY];
}

const ALL: Record<FileKind, Question[]> = {
  buyer: [SEARCH, CONSULT, REP, OFFER].flatMap((g) => g.questions),
  listing: [HOME, CONSULT, LISTING, PROPERTY].flatMap((g) => g.questions).filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i),
};
export const allQuestions = (kind: FileKind) => ALL[kind];

export type Answers = Record<string, string>;
export type CleanFile = { address: string | null; price: number | null; info: Answers; commission: { commission: string; bac: string } };

/** Checks and tidies answers. Throws a plain message the user can fix. */
export function cleanAnswers(kind: FileKind, raw: Answers, required: Question[] = []): CleanFile {
  const info: Answers = {};
  let address: string | null = null, price: number | null = null;
  const commission = { commission: "", bac: "" };
  for (const qn of ALL[kind]) {
    const v = (raw[qn.key] ?? "").toString().trim();
    if (!v) { if (required.some((r) => r.key === qn.key)) throw new Error(`Add the ${qn.label.toLowerCase()}.`); continue; }
    let out = v.slice(0, 200);
    if (qn.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${qn.label}: pick a date.`);
    if (qn.type === "money" || qn.type === "number") {
      const n = Number(v.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new Error(`${qn.label}: use a number.`);
      out = String(Math.round(n));
    }
    if (qn.type === "choice" && !qn.options!.includes(v)) throw new Error(`${qn.label}: pick one of the choices.`);
    if (qn.key === "address") address = out;
    else if (qn.key === "price") price = Number(out);
    else if (qn.commission) commission[qn.key as "commission" | "bac"] = out;
    else info[qn.key] = out;
  }
  return { address, price, info, commission };
}

// ---------- Display ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDay = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const kMoney = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n));

/** What a viewer may see of a file. Commission and BAC are null unless allowed ("See commissions"). */
export type FileView = {
  id: string; kind: FileKind; personId: string; personName: string; statusId: string | null; status: string; statusSince: string;
  address: string | null; price: number | null; info: Answers; commission: string | null; bac: string | null; closedAt: string | null;
};

export function toFileView(
  f: { id: string; kind: string; personId: string; statusId: string | null; statusSince: Date; address: string | null; price: number | null; info: unknown; closedAt: Date | null; person: { name: string }; status: { name: string } | null; commission?: { commission: string; bac: string } | null },
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
  };
}

/** "Looking in Edina · $350–400k" for buyers, the address for listings. */
export const fileLine = (f: Pick<FileView, "kind" | "address" | "info">) =>
  f.kind === "buyer" ? [f.info.areas, f.info.range].filter(Boolean).join(" · ") || "Looking" : f.address ?? "Address not set";

/** Label/value pairs for the facts line. Empty values, and commission values the viewer can't see, are left out. */
export function factRows(f: FileView): [string, string][] {
  const i = f.info, dt = (k: string) => (i[k] ? shortDay(i[k]) : "");
  const rows: [string, string | undefined | false][] = f.kind === "buyer"
    ? [["Looking in", i.areas], ["Price range", i.range], ["Timeframe", i.timeframe], ["Pre-approved", i.preapproved], ["Lender", i.lender], ["Consult", dt("consult")],
       ["Rep signed", dt("repSigned")], ["Rep expires", dt("repExpires")], ["BAC", f.bac ?? ""], ["Offer", i.offer], ["Response due", dt("respond")]]
    : [[f.status === "Consult scheduled" || f.status === "Consult complete" ? "Estimated value" : "List price", f.price ? money(f.price) : ""], ["Timeframe", i.timeframe], ["Consult", dt("consult")],
       ["Listing signed", dt("lcSigned")], ["Expires", dt("lcExpires")], ["Commission", f.commission ?? ""], ["BAC offered", f.bac ?? ""], ["Photos", dt("photos")], ["Active", dt("active")],
       ["Property", [i.ptype, i.year && `built ${i.year}`, i.hoa === "Yes" && "HOA", i.newc === "Yes" && "New construction"].filter(Boolean).join(" · ")]];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

/** Health dot from overdue open tasks: none on track, 1–2 something overdue, 3+ behind. */
export const health = (overdue: number): "g" | "y" | "r" => (overdue >= 3 ? "r" : overdue ? "y" : "g");
export const HEALTH_LABEL = { g: "On track", y: "Something overdue", r: "Behind" } as const;
