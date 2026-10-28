// Owner's sales Google Sheet (owner request 2026-10-28): when a deal goes under contract HQ adds a row under the
// headers with what it knows; the owner fills the rest. Close date and price follow changes; a deal that falls
// through has its row removed. Pure, tested in salesSheet.test.ts.
import { apptName } from "@/lib/appointments";

/** "https://docs.google.com/spreadsheets/d/<id>/edit?gid=123#gid=123" → { id, gid }. */
export function parseSheetLink(url: string): { id: string; gid: number } | null {
  const id = /\/spreadsheets\/d\/([\w-]{20,})/.exec(url)?.[1];
  if (!id) return null;
  const gid = /[#?&]gid=(\d+)/.exec(url)?.[1];
  return { id, gid: gid ? Number(gid) : 0 };
}

/** "2001 Westwood Hills Drive, Saint Louis Park, MN 55426" → street, city, ZIP. */
export function splitAddress(address: string): { street: string; city: string; zip: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(parts.slice(1).join(" "))?.[1] ?? "";
  return { street: parts[0] ?? "", city: parts.length > 2 ? parts[1] : parts.length === 2 && !/^[A-Z]{2}\b/.test(parts[1]) ? parts[1].replace(/\s+[A-Z]{2}\s+\d{5}.*$/, "") : "", zip };
}

/** A dropdown choice for a value: exact (any case), or the longest choice the value contains ("Zillow Preferred" → ZILLOW). */
export function matchOption(value: string, options: string[]): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  const exact = options.find((o) => o.trim().toUpperCase() === v);
  if (exact) return exact;
  return options.filter((o) => o.trim() && v.includes(o.trim().toUpperCase())).sort((a, b) => b.length - a.length)[0] ?? null;
}

export type SheetDeal = {
  personName: string; address: string; closing: string | null; side: "buyer" | "seller"; price: number; sc: string;
  lenderName: string; financing: string; referredBy: string; listPrice: number | null; commission: string | null; source: string;
};
export type SheetShape = { headers: string[]; formulaCols: Set<number>; options: Record<number, string[]> };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const col = (shape: SheetShape, ...names: string[]) => shape.headers.findIndex((h) => names.includes(norm(h)));

/** Close-date columns: CLOSE DATE, MONTH, Month #, QUARTER, YEAR. */
function dateCells(shape: SheetShape, closing: string | null): [number, string][] {
  if (!closing) return [];
  const [y, m, d] = closing.split("-").map(Number);
  return [[col(shape, "close date"), `${m}/${d}/${y}`], [col(shape, "month"), MONTHS[m - 1]], [col(shape, "month #", "month#"), String(m)], [col(shape, "quarter"), String(Math.ceil(m / 3))], [col(shape, "year"), String(y)]];
}

/** Seller contributions in dollars ("3%" of the price, or "5000"). */
const scDollars = (sc: string, price: number) => (/%\s*$/.test(sc) ? Math.round((price * Number(sc.replace(/[%\s]/g, ""))) / 100) : Number(sc.replace(/[$,\s]/g, "")) || 0);

/** The new row's cells (column index → value). Columns that are formulas, or not found, are left alone. */
export function buildRow(shape: SheetShape, d: SheetDeal): Map<number, string> {
  const { street, city, zip } = splitAddress(d.address);
  const lenderCol = col(shape, "lender");
  const lender = d.side === "seller" ? "N/A" : /cash/i.test(d.financing) ? "CASH" : matchOption(d.lenderName, shape.options[lenderCol] ?? []) ?? (d.lenderName ? "OTHER" : "");
  const srcCol = col(shape, "initial source");
  const cells: [number, string][] = [
    [col(shape, "client name"), apptName(d.personName)], [col(shape, "property address"), street], [col(shape, "city"), city], [col(shape, "zip code", "zip"), zip],
    ...dateCells(shape, d.closing),
    [col(shape, "deal type"), d.side === "seller" ? "SELLER" : "BUYER"],
    [lenderCol, lender], [col(shape, "referred from"), d.referredBy.trim() || "None"],
    [col(shape, "sale price"), money(d.price)], [col(shape, "seller contributions", "seller contribution"), money(scDollars(d.sc, d.price))],
    [col(shape, "list price"), d.listPrice ? money(d.listPrice) : ""],
    [col(shape, "commission %"), d.commission ? `${Number(d.commission)}%` : ""],
    [srcCol, matchOption(d.source, shape.options[srcCol] ?? []) ?? ""],
  ];
  return new Map(cells.filter(([i, v]) => i >= 0 && v !== "" && !shape.formulaCols.has(i)));
}

/** When a contract changes: just the close date and sale price columns. */
export function changedCells(shape: SheetShape, d: Pick<SheetDeal, "closing" | "price">): Map<number, string> {
  return new Map([...dateCells(shape, d.closing), [col(shape, "sale price"), money(d.price)] as [number, string]].filter(([i]) => i >= 0 && !shape.formulaCols.has(i)));
}

/** Which row (0-based, below the headers) is this deal: same property street and client name. */
export function findRow(rows: string[][], d: Pick<SheetDeal, "personName" | "address">, shape: SheetShape): number | null {
  const a = col(shape, "property address"), c = col(shape, "client name");
  if (a < 0) return null;
  const street = splitAddress(d.address).street.toLowerCase(), client = apptName(d.personName).toLowerCase();
  const i = rows.findIndex((r, n) => n > 0 && (r[a] ?? "").trim().toLowerCase() === street && (c < 0 || (r[c] ?? "").trim().toLowerCase() === client));
  return i > 0 ? i : null;
}

/** 0 → "A", 27 → "AB". */
export function colLetter(i: number): string {
  let s = "", n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
