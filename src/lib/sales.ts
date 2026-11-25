// Sales (owner request 2026-11-22; SPEC.md §7.9): the owner's master file's DATA tab, its SUMMARY and SALES COMPARE
// math, reading the file, matching sales to contacts, and turning a purchase agreement into a sale. Pure, tested in
// sales.test.ts. Money here is only ever handed to the owner (src/server/sales.ts checks).
import { addressKey, parseCsv } from "@/lib/addressList";

export type SaleStatus = "pending" | "closed" | "fell_through";
export const STATUS_LABEL: Record<string, string> = { pending: "Pending", closed: "Closed", fell_through: "Fell through" };
/** The master file's SOURCE choices (others typed in are kept as they are). */
export const SOURCES = ["SPHERE", "SPHERE REFERRAL", "PAST CLIENT REFERRAL", "REPEAT PAST CLIENT", "PERSONAL REFERRAL", "PERSONAL LEAD", "INDUSTRY REFERRAL", "LENDER REFERRAL", "TEAM LEAD", "ZILLOW", "OTHER"];

/** What the stats need from a sale. */
export type StatSale = { status: string; side: string; closeDate: string | null; source: string; referredFrom: string; price: number; listPrice: number; gross: number; net: number; commissionPaid: boolean };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : 0);
export const monthOf = (iso: string | null) => (iso ? Number(iso.slice(5, 7)) : 0);
export const quarterOf = (iso: string | null) => Math.ceil(monthOf(iso) / 3);

export type Totals = { deals: number; volume: number; avgPrice: number; gross: number; grossPct: number; net: number; splitPct: number; listVolume: number; netPct: number };
/** The SUMMARY tab's columns for a set of sales: deals, volume, average sale price, gross commission, gross % (of
 *  volume), commission after the split, split % (of gross), and sale-to-list (NET %). */
export function totals(rows: StatSale[]): Totals {
  const volume = sum(rows.map((r) => r.price)), gross = sum(rows.map((r) => r.gross)), net = sum(rows.map((r) => r.net));
  const withList = rows.filter((r) => r.listPrice > 0), listVolume = sum(withList.map((r) => r.listPrice));
  return { deals: rows.length, volume, avgPrice: rows.length ? volume / rows.length : 0, gross, grossPct: volume ? (gross / volume) * 100 : 0, net,
    splitPct: gross ? (net / gross) * 100 : 0, listVolume, netPct: listVolume ? (sum(withList.map((r) => r.price)) / listVolume) * 100 : 0 };
}

const closed = (rows: StatSale[]) => rows.filter((r) => r.status === "closed" && r.closeDate);
const pendingOf = (rows: StatSale[]) => rows.filter((r) => r.status === "pending" && r.closeDate);
/** Every year that has a sale dated in it (closed or pending), so a new year shows everywhere as soon as one sale is
 *  in it (owner request 2026-11-25: "I added a sale for 2027, that year should get added everywhere"). */
export function saleYears(rows: StatSale[], today?: string): number[] {
  return [...new Set([...rows.filter((r) => r.status !== "fell_through" && r.closeDate).map((r) => yearOf(r.closeDate)), ...(today ? [yearOf(today)] : [])])].filter(Boolean).sort((a, b) => b - a);
}

/** SUMMARY: one row per year (oldest first) for all, buyer and seller closed sales, plus CAREER. */
export function yearSummary(rows: StatSale[], side?: "buyer" | "seller") {
  const list = closed(rows).filter((r) => !side || r.side === side);
  const years = [...new Set(list.map((r) => yearOf(r.closeDate)))].sort();
  return { years: years.map((y) => ({ year: y, ...totals(list.filter((r) => yearOf(r.closeDate) === y)) })), career: totals(list) };
}

export type Period = "month" | "quarter" | "year";
/** Which month / quarter / year "now" is in, Central time ("2026-11-22"). */
export function periodOf(kind: Period, today: string): { kind: Period; month: number; quarter: number; year: number; label: string } {
  const year = yearOf(today), month = monthOf(today), quarter = Math.ceil(month / 3);
  const label = kind === "month" ? MONTHS[month - 1] : kind === "quarter" ? `Q${quarter}` : "Full year";
  return { kind, month, quarter, year, label };
}
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Is a close date in that month / quarter (of any year), or any time in the year? */
export const inPeriod = (iso: string | null, p: { kind: Period; month: number; quarter: number }) =>
  !!iso && (p.kind === "year" || (p.kind === "month" ? monthOf(iso) === p.month : quarterOf(iso) === p.quarter));

/** SALES COMPARE: the same month / quarter / year in every year with sales, newest first. */
export function compareYears(rows: StatSale[], p: { kind: Period; month: number; quarter: number; year: number }) {
  const list = closed(rows).filter((r) => inPeriod(r.closeDate, p));
  const pend = pendingOf(rows).filter((r) => inPeriod(r.closeDate, p));
  const years = [...new Set([...saleYears(rows), p.year])].sort((a, b) => b - a);
  return years.map((y) => { const pe = pend.filter((r) => yearOf(r.closeDate) === y); return { year: y, ...totals(list.filter((r) => yearOf(r.closeDate) === y)), pending: pe.length, pendingVolume: sum(pe.map((r) => r.price)) }; });
}

/** Closed sales in the period of one year, broken down by a field (SOURCE, Referred From), biggest volume first. */
export function breakdown(rows: StatSale[], by: "source" | "referredFrom", p: { kind: Period; month: number; quarter: number }, year: number) {
  const list = closed(rows).filter((r) => yearOf(r.closeDate) === year && inPeriod(r.closeDate, p));
  const keys = [...new Set(list.map((r) => (r[by] || "None").trim() || "None"))];
  return keys.map((k) => ({ key: k, ...totals(list.filter((r) => ((r[by] || "None").trim() || "None") === k)) })).sort((a, b) => b.volume - a.volume || b.deals - a.deals);
}

/** The dashboard's top numbers. Outstanding = closed but the commission isn't marked paid; pending = under contract now. */
export function dashboard(rows: StatSale[], p: { kind: Period; month: number; quarter: number; year: number }) {
  const pending = rows.filter((r) => r.status === "pending");
  const now = closed(rows).filter((r) => yearOf(r.closeDate) === p.year && inPeriod(r.closeDate, p));
  const owed = closed(rows).filter((r) => !r.commissionPaid);
  return {
    pending: { deals: pending.length, volume: sum(pending.map((r) => r.price)), gross: sum(pending.map((r) => r.gross)), net: sum(pending.map((r) => r.net)) },
    closed: totals(now),
    outstanding: { deals: owed.length, gross: sum(owed.map((r) => r.gross)), net: sum(owed.map((r) => r.net)) },
  };
}

// ---------- Reading the master file (the DATA tab saved as CSV) ----------

export type ImportRow = {
  line: number; clientName: string; address: string; city: string; zip: string; closeDate: string; side: "buyer" | "seller"; source: string; lender: string;
  referredFrom: string; price: number; contributions: number; listPrice: number; commissionPct: number; gross: number; fees: number; net: number; splitPct: number;
  completed: boolean; commissionPaid: boolean; onTime: string; initialSource: string;
};
const num = (v: string | undefined) => { const t = (v ?? "").replace(/[$,%\s]/g, ""); if (!t || t === "-" || /^#/.test(t)) return 0; const n = Number(t); return Number.isFinite(n) ? n : 0; };
/** "11/20/2026", "6/1/18", "2026-11-20" → "2026-11-20". */
export function readSaleDate(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
  return d.getUTCMonth() === Number(m[1]) - 1 ? d.toISOString().slice(0, 10) : null;
}
const FEE_COLS = ["brokerage fee", "lc", "tc", "e&o", "media package", "home readiness", "z showcase", "referral fee", "broker admin"];

/** The DATA tab saved as CSV (its own headings: CLIENT NAME, PROPERTY ADDRESS, CLOSE DATE, DEAL TYPE, SALE PRICE…). */
export function readSalesCsv(text: string): { rows: ImportRow[]; problem: string | null; skipped: number } {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  const at = all.findIndex((r) => r.some((c) => /^client name$/i.test(c.trim())) && r.some((c) => /^close date$/i.test(c.trim())));
  if (at < 0) return { rows: [], problem: 'The file needs the master file\'s headings ("CLIENT NAME", "CLOSE DATE", "SALE PRICE"…).', skipped: 0 };
  const head = all[at].map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const c = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = { client: c("client name"), address: c("property address"), city: c("city"), zip: c("zip code", "zip"), date: c("close date"), type: c("deal type"),
    source: c("source"), lender: c("lender"), ref: c("referred from"), price: c("sale price"), sc: c("seller contributions"), list: c("list price"),
    pct: c("commission %"), gross: c("gross commission"), net: c("commision", "commission", "net income"), split: c("split %"), done: c("deal completed?"),
    paid: c("commission paid?"), onTime: c("on time close?"), init: c("initial source") };
  const fees = FEE_COLS.map((f) => head.indexOf(f)).filter((i) => i >= 0);
  let skipped = 0;
  const rows: ImportRow[] = [];
  all.slice(at + 1).forEach((r, k) => {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const closeDate = readSaleDate(get(ix.date));
    if (!closeDate || !get(ix.address) || !/^(buyer|seller)$/i.test(get(ix.type))) { if (r.some((x) => x.trim())) skipped++; return; }
    const price = num(get(ix.price)), gross = num(get(ix.gross));
    rows.push({ line: at + k + 2, clientName: get(ix.client), address: get(ix.address), city: get(ix.city), zip: get(ix.zip), closeDate, side: get(ix.type).toLowerCase() as "buyer" | "seller",
      source: get(ix.source).toUpperCase(), lender: get(ix.lender), referredFrom: /^none$/i.test(get(ix.ref)) ? "" : get(ix.ref), price, contributions: num(get(ix.sc)),
      listPrice: num(get(ix.list)), commissionPct: num(get(ix.pct)) || (price ? Math.round((gross / price) * 10000) / 100 : 0), gross, fees: fees.reduce((a, i) => a + num(get(i)), 0),
      net: num(get(ix.net)), splitPct: num(get(ix.split)), completed: !/^no$/i.test(get(ix.done)), commissionPaid: !/^no$/i.test(get(ix.paid)), onTime: get(ix.onTime).toUpperCase(),
      initialSource: get(ix.init).toUpperCase() });
  });
  return { rows, problem: rows.length ? null : "No sales could be read from that file.", skipped };
}
/** A re-import updates the same sale: its close date, side and street (both sides of one house are two sales, 2144 Grimm Road). */
export const streetOf = (address: string) => addressKey(address) ?? address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const importKeyOf = (closeDate: string, side: string, address: string) => `${closeDate}|${side}|${streetOf(address)}`;

// ---------- Matching a sale to HQ contacts ----------

export type MatchPerson = { id: string; name: string; addresses: string[]; pastClient: boolean };
export type MatchResult = { sure: string[]; maybe: { id: string; name: string; why: string }[] };
const words = (s: string) => s.toLowerCase().replace(/[^a-z' -]+/g, " ").split(/[\s-]+/).filter(Boolean);
/** "Sharpe/Nguyen" → ["sharpe", "nguyen"]; "Becker/LaCoursiere" → ["becker", "lacoursiere"]; "Honey Brothers 2" → ["honey", "brothers"]. */
export const familyOf = (client: string) => client.split(/[/&,]| and /i).map((p) => words(p).filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(-1)[0]).filter((w): w is string => !!w);

/**
 * Who a sale belongs to. Sure: the contact whose address is the sale's street and whose name has one of the family
 * names; or the only contact whose name has every family name. Maybe (for the owner to pick): an address match with a
 * different name, or several contacts with the name. Nothing found: a new contact is made.
 */
export function matchSale(sale: { clientName: string; address: string }, people: MatchPerson[]): MatchResult {
  const fam = familyOf(sale.clientName);
  const key = addressKey(sale.address);
  const hasName = (p: MatchPerson, all: boolean) => { const w = words(p.name); return all ? fam.length > 0 && fam.every((f) => w.includes(f)) : fam.some((f) => w.includes(f)); };
  const atAddress = key ? people.filter((p) => p.addresses.some((a) => addressKey(a) === key)) : [];
  const addrNamed = atAddress.filter((p) => hasName(p, false));
  if (addrNamed.length === 1) return { sure: [addrNamed[0].id], maybe: [] };
  const named = people.filter((p) => hasName(p, true));
  const maybe = new Map<string, { id: string; name: string; why: string }>();
  for (const p of atAddress) maybe.set(p.id, { id: p.id, name: p.name, why: hasName(p, false) ? "same address and name" : "same address" });
  if (!atAddress.length && named.length === 1 && (fam.length > 1 || named[0].pastClient)) return { sure: [named[0].id], maybe: [] };
  for (const p of named.slice(0, 8)) if (!maybe.has(p.id)) maybe.set(p.id, { id: p.id, name: p.name, why: p.pastClient ? "same name (past client)" : "same name" });
  if (!maybe.size && fam.length) for (const p of people.filter((x) => hasName(x, false)).slice(0, 8)) maybe.set(p.id, { id: p.id, name: p.name, why: "shares a last name" });
  return { sure: [], maybe: [...maybe.values()] };
}

/** A contact name for a sale with nobody to match: "Sharpe/Nguyen" → "Sharpe & Nguyen". */
export const contactNameFor = (client: string) => client.split("/").map((s) => s.trim()).filter(Boolean).join(" & ") || "Past client";

// ---------- A sale from an HQ purchase agreement ----------

/** "2.7", "2.7%", "3 %" → 2.7; a dollar amount ("$5,000") is turned into a % of the price. */
export function commissionPctOf(v: string | null | undefined, price: number): number {
  const t = (v ?? "").trim();
  if (!t) return 0;
  if (/^\$/.test(t)) { const d = num(t); return price ? Math.round((d / price) * 10000) / 100 : 0; }
  return num(t);
}
/** LENDER as the master file writes it: N/A for sellers, CASH, else the lender's name. */
export const lenderLabel = (side: string, financing: string, lender: string) => (side === "seller" ? "N/A" : /cash/i.test(financing) ? "CASH" : (lender.trim() || "OTHER").toUpperCase());
/** SOURCE from the contact's source ("Zillow Preferred" → ZILLOW, "Sphere Referral" → SPHERE REFERRAL). */
export function sourceLabel(source: string): string {
  const v = source.trim().toUpperCase();
  if (!v) return "";
  return SOURCES.find((s) => s === v) ?? SOURCES.filter((s) => v.includes(s)).sort((a, b) => b.length - a.length)[0] ?? v;
}
/** "Sharpe/Nguyen" style name from a contact: "Will & Katie Sharpe" → "Sharpe"; "Tony Wagner & Laura Schmidt" → "Wagner/Schmidt". */
export function clientNameOf(personName: string): string {
  const parts = personName.split(/\s*&\s*|\s+and\s+/i).map((p) => p.trim().split(/\s+/)).filter((p) => p.length);
  const lasts = [...new Set(parts.filter((p) => p.length > 1).map((p) => p[p.length - 1]))];
  return lasts.join("/") || personName.trim();
}
/** Gross and net for a new sale: gross = price × commission %; net = gross × the split % (the owner's usual one). */
export const moneyFor = (price: number, pct: number, splitPct: number) => { const gross = Math.round(price * pct) / 100; return { gross, net: Math.round(gross * splitPct) / 100 }; };

// ---------- All sales columns: which show, in the master file's order (owner request 2026-11-22) ----------
export const SALE_COLUMNS = [
  ["client", "Client"], ["address", "Address"], ["city", "City"], ["zip", "ZIP"], ["closeDate", "Close date"], ["side", "Type"], ["status", "Status"],
  ["source", "Source"], ["initialSource", "Initial source"], ["lender", "Lender"], ["referredFrom", "Referred from"], ["price", "Sale price"],
  ["listPrice", "List price"], ["contributions", "Seller contributions"], ["commissionPct", "Comm %"], ["gross", "Gross"], ["fees", "Fees"],
  ["net", "Net"], ["splitPct", "Split"], ["commissionPaid", "Paid"], ["onTime", "On time"],
] as const;
export type SaleColumn = (typeof SALE_COLUMNS)[number][0];
export const DEFAULT_SALE_COLUMNS: SaleColumn[] = ["client", "address", "closeDate", "side", "status", "source", "referredFrom", "price", "commissionPct", "gross", "net", "splitPct", "commissionPaid"];
/** Saved column choice → known keys in the standard order; client always shows; nothing saved → the defaults. */
export function cleanSaleColumns(v: unknown): SaleColumn[] {
  if (!Array.isArray(v)) return DEFAULT_SALE_COLUMNS;
  const want = new Set(v.filter((x): x is string => typeof x === "string"));
  want.add("client");
  return SALE_COLUMNS.map(([k]) => k).filter((k) => want.has(k));
}

// ---------- Dashboard cards: which show, in what order and size (owner request 2026-11-22) ----------
export const DASH_CARDS = {
  pending: { label: "Pending sales", about: "Under contract now: count, volume and GCI", size: "small" },
  closed: { label: "Closed sales", about: "Closed in the period, vs last year", size: "small" },
  volume: { label: "Volume", about: "Sale volume closed in the period, vs last year", size: "small" },
  gross: { label: "Gross commission", about: "GCI closed in the period and % of volume", size: "small" },
  net: { label: "Net income", about: "Your commission after split and fees", size: "small" },
  owed: { label: "Commission owed to you", about: "Closed sales not marked paid", size: "small" },
  avgPrice: { label: "Average sale price", about: "Average price of sales closed in the period", size: "small" },
  sides: { label: "Buyers vs sellers", about: "How many buyer and seller sales closed", size: "small" },
  saleToList: { label: "Sale-to-list", about: "Sale price as % of list price", size: "small" },
  everyYear: { label: "Every year (table)", about: "The period in every year: sales, volume, GCI, net", size: "half" },
  volumeChart: { label: "Volume by year (chart)", about: "Bar chart of volume for the period in every year", size: "half" },
  dealsChart: { label: "Sales by year (chart)", about: "Bar chart of closed sales for the period in every year", size: "half" },
  netChart: { label: "Net income by year (chart)", about: "Bar chart of your net income in every year", size: "half" },
  monthly: { label: "Month by month (chart)", about: "Volume each month this year next to last year", size: "full" },
  bySource: { label: "By lead source (table)", about: "Closed sales by lead source", size: "half" },
  sourceChart: { label: "By lead source (chart)", about: "Bar chart of volume by lead source", size: "half" },
  byReferral: { label: "By referral (table)", about: "Closed sales by who referred them", size: "full" },
  pendingList: { label: "Pending deals (list)", about: "Every sale under contract, with close date and price", size: "half" },
  owedList: { label: "Owed commissions (list)", about: "Closed sales not marked paid", size: "half" },
} as const;
export type DashCardKind = keyof typeof DASH_CARDS;
export const DASH_SIZES = { small: "Small", medium: "Medium", half: "Half width", full: "Full width" } as const;
export type DashSize = keyof typeof DASH_SIZES;
export type DashCard = { id: string; kind: DashCardKind; size: DashSize; sub?: TileSub };
/** What a number tile shows under its number (owner request 2026-11-22: "change what's below these cards"). */
export const TILE_SUBS = {
  usual: "The usual line", vsLast: "% change vs last year", diffLast: "Difference vs last year", lastYear: "Last year's number",
  perSale: "Average per sale", pctVolume: "% of volume", split: "Split % (net ÷ gross)", deals: "Number of sales", gci: "Gross commission", none: "Nothing",
} as const;
export type TileSub = keyof typeof TILE_SUBS;
/** Which lines make sense under each tile. */
export const SUBS_FOR: Partial<Record<DashCardKind, TileSub[]>> = {
  pending: ["usual", "gci", "deals", "none"],
  closed: ["usual", "vsLast", "diffLast", "lastYear", "none"],
  volume: ["usual", "vsLast", "diffLast", "lastYear", "perSale", "deals", "gci", "none"],
  gross: ["usual", "pctVolume", "vsLast", "diffLast", "lastYear", "perSale", "deals", "none"],
  net: ["usual", "split", "pctVolume", "vsLast", "diffLast", "lastYear", "perSale", "deals", "none"],
  owed: ["usual", "none"],
  avgPrice: ["usual", "vsLast", "diffLast", "lastYear", "deals", "none"],
  sides: ["usual", "none"],
  saleToList: ["usual", "vsLast", "lastYear", "none"],
};
export const DEFAULT_DASHBOARD: DashCard[] = (["pending", "closed", "volume", "gross", "net", "owed", "everyYear", "bySource", "byReferral"] as DashCardKind[])
  .map((kind) => ({ id: kind, kind, size: DASH_CARDS[kind].size }));
/** A saved dashboard → known cards and sizes (max 40); nothing usable saved → the default layout. */
export function cleanDashboard(v: unknown): DashCard[] {
  if (!Array.isArray(v)) return DEFAULT_DASHBOARD;
  const seen = new Set<string>();
  const out: DashCard[] = [];
  for (const x of v.slice(0, 40)) {
    if (!x || typeof x !== "object") continue;
    const { id, kind, size } = x as Record<string, unknown>;
    if (typeof kind !== "string" || !(kind in DASH_CARDS)) continue;
    const cid = typeof id === "string" && /^[\w-]{1,40}$/.test(id) && !seen.has(id) ? id : `${kind}-${out.length}`;
    seen.add(cid);
    const k = kind as DashCardKind;
    const sub = (x as Record<string, unknown>).sub;
    const card: DashCard = { id: cid, kind: k, size: typeof size === "string" && size in DASH_SIZES ? (size as DashSize) : DASH_CARDS[k].size };
    if (typeof sub === "string" && sub !== "usual" && (SUBS_FOR[k] ?? []).includes(sub as TileSub)) card.sub = sub as TileSub;
    out.push(card);
  }
  return out;
}
/** Closed volume and count per month (1–12) of a year. */
export function byMonth(rows: StatSale[], year: number) {
  const list = closed(rows).filter((r) => yearOf(r.closeDate) === year);
  return MONTHS.map((_, i) => { const m = list.filter((r) => monthOf(r.closeDate!) === i + 1); return { month: i + 1, deals: m.length, volume: sum(m.map((r) => r.price)) }; });
}

/** The SUMMARY tab by year, quarter or month (owner request 2026-11-22). Quarters and months can be limited to one year;
 *  `key` sorts in time order ("2026", "2026-Q4", "2026-11"). Closed sales only. */
export type SummaryBy = "year" | "quarter" | "month";
export function summaryBy(rows: StatSale[], by: SummaryBy, side?: "buyer" | "seller", onlyYear?: number) {
  const list = closed(rows).filter((r) => (!side || r.side === side) && (!onlyYear || yearOf(r.closeDate) === onlyYear));
  const pend = pendingOf(rows).filter((r) => (!side || r.side === side) && (!onlyYear || yearOf(r.closeDate) === onlyYear));
  const keyOf = (iso: string) => by === "year" ? iso.slice(0, 4) : by === "quarter" ? `${iso.slice(0, 4)}-Q${Math.ceil(monthOf(iso) / 3)}` : iso.slice(0, 7);
  const labelOf = (k: string) => by === "year" ? k : by === "quarter" ? `${k.slice(5)} ${k.slice(0, 4)}` : `${MONTHS[Number(k.slice(5, 7)) - 1].slice(0, 3)} ${k.slice(0, 4)}`;
  // A year, quarter or month with only pending sales still gets a row (0 closed), with its pending count.
  const keys = [...new Set([...list, ...pend].map((r) => keyOf(r.closeDate!)))].sort();
  const pendingIn = (k: string) => { const pe = pend.filter((r) => keyOf(r.closeDate!) === k); return { pending: pe.length, pendingVolume: sum(pe.map((r) => r.price)) }; };
  return { rows: keys.map((k) => ({ key: k, label: labelOf(k), ...totals(list.filter((r) => keyOf(r.closeDate!) === k)), ...pendingIn(k) })), total: { ...totals(list), pending: pend.length, pendingVolume: sum(pend.map((r) => r.price)) } };
}
