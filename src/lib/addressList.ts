import { z } from "zod";

// Import address list (owner request 2026-11-04): a holiday-card spreadsheet (CSV) into HQ. People already in HQ
// are matched (name, then address, then "maybe" by last name) so nobody is added twice. Pure, tested.

export type ListRow = { first: string; last: string; household: string; street: string; line2: string; city: string; state: string; zip: string };
export type HqPerson = { id: string; name: string; addresses: string[] };
export type Match = { personId: string; name: string; how: "name" | "address" | "maybe"; addresses: string[] };

/** Splits CSV text into rows (quoted fields, "" escapes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLUMNS: [keyof ListRow, RegExp][] = [
  ["household", /display|household|mailing|envelope/i],
  ["line2", /line\s*2|address\s*2|apt|unit/i],
  ["street", /line\s*1|address\s*1|street|^address$/i],
  ["first", /first/i],
  ["last", /last/i],
  ["city", /city|town/i],
  ["state", /state|province/i],
  ["zip", /postal|zip/i],
];

/** Reads the list by its header row (First Name, Last Name, Display/Household Name, Address Line 1…). */
export function readAddressList(csv: string): { rows: ListRow[]; problem: string | null } {
  const [head, ...body] = parseCsv(csv);
  if (!head) return { rows: [], problem: "That file is empty." };
  const at: Partial<Record<keyof ListRow, number>> = {};
  head.forEach((h, i) => { const hit = COLUMNS.find(([k, re]) => at[k] === undefined && re.test(h.trim())); if (hit) at[hit[0]] = i; });
  if (at.street === undefined || (at.first === undefined && at.household === undefined)) return { rows: [], problem: "Couldn't find the name and address columns. The first row should have headings like First Name, Last Name, Address Line 1, City, State, Postal." };
  const get = (r: string[], k: keyof ListRow) => (at[k] === undefined ? "" : (r[at[k]!] ?? "").trim().replace(/\s+/g, " "));
  const rows = body.map((r) => {
    const zip = get(r, "zip");
    return { first: get(r, "first"), last: get(r, "last"), household: get(r, "household"), street: get(r, "street"), line2: get(r, "line2"), city: get(r, "city"), state: get(r, "state").toUpperCase(), zip: /^\d{4}$/.test(zip) ? `0${zip}` : zip };
  }).filter((r) => (r.first || r.last || r.household) && r.street);
  return { rows, problem: rows.length ? null : "No rows with a name and an address." };
}

/** The contact's name: "AJ & Emily Pettersen", or the household name when there's no first/last ("The Anderson Family"). */
export function listName(r: ListRow): string {
  return `${r.first} ${r.last}`.trim() || r.household;
}

/** "5137 Clear Spring Drive, Minnetonka, MN 55345" (line 2 after the street). */
export function listAddress(r: ListRow): string {
  return [[r.street, r.line2].filter(Boolean).join(", "), r.city, `${r.state} ${r.zip}`.trim()].filter(Boolean).join(", ");
}

/** The mailing name to save: the household column, when it says something different from the name. */
export function listMailingName(r: ListRow): string | null {
  return r.household && r.household !== listName(r) ? r.household : null;
}

const nameKey = (n: string) => n.toLowerCase().replace(/\band\b/g, "&").replace(/[^a-z0-9&]+/g, " ").replace(/\s*&\s*/g, " & ").trim();
/** House number + first street word ("5137 clear"), ignoring N/S/E/W. */
export function addressKey(a: string): string | null {
  const m = a.trim().match(/^(\d+[A-Za-z]?)\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?([A-Za-z0-9]+)/i);
  return m ? `${m[1]} ${m[2]}`.toLowerCase() : null;
}
/** The family name: the last word, or the word before "Family" ("The Anderson Family" → anderson; "The Smith/Hess Family" → smith, hess). */
export function familyNames(name: string): string[] {
  const n = name.toLowerCase().replace(/[^a-z/& -]+/g, " ").trim();
  const fam = n.match(/^the\s+(.+?)(?:\s+family)?$/);
  const last = fam ? fam[1] : n.split(/\s+/).pop() ?? "";
  return last.split(/[/&]|\s+/).map((x) => x.trim()).filter((x) => x.length > 1 && x !== "the" && x !== "family");
}
const firstNames = (name: string) => name.toLowerCase().replace(/[^a-z& ]+/g, " ").split(/\s*&\s*|\s+and\s+/).map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);

/**
 * Who in HQ this row is: the same name, else someone at the same address, else up to three "maybe"s with the same
 * family name (and a shared first name, unless the row is a household like "The Anderson Family").
 */
export function matchRow(r: ListRow, people: HqPerson[]): Match[] {
  const name = listName(r);
  const toMatch = (p: HqPerson, how: Match["how"]): Match => ({ personId: p.id, name: p.name, how, addresses: p.addresses });
  const byName = people.filter((p) => nameKey(p.name) === nameKey(name) || (r.household && nameKey(p.name) === nameKey(r.household)));
  if (byName.length) return byName.slice(0, 3).map((p) => toMatch(p, "name"));
  const k = addressKey(r.street);
  const byAddress = k ? people.filter((p) => p.addresses.some((a) => addressKey(a) === k)) : [];
  if (byAddress.length) return byAddress.slice(0, 3).map((p) => toMatch(p, "address"));
  const fams = familyNames(r.last || name);
  if (!fams.length) return [];
  const household = !r.first || (!r.last && /^the\s|\bfamily$|^the\s+\S+s$/i.test(r.first));
  const firsts = household ? [] : firstNames(r.first);
  return people.filter((p) => {
    const pf = familyNames(p.name);
    if (!pf.some((f) => fams.includes(f))) return false;
    return household || firstNames(p.name).some((f) => firsts.includes(f));
  }).slice(0, 3).map((p) => toMatch(p, "maybe"));
}

/** Does the list's address already appear on this contact? */
export const hasAddress = (addresses: string[], r: ListRow) => { const k = addressKey(r.street); return !!k && addresses.some((a) => addressKey(a) === k); };

export const GROUPS = ["family", "friend", "wife"] as const;
export type Group = (typeof GROUPS)[number] | "";

const row = z.object({ first: z.string().max(200), last: z.string().max(200), household: z.string().max(200), street: z.string().max(300), line2: z.string().max(200), city: z.string().max(100), state: z.string().max(40), zip: z.string().max(20) });
export const applySchema = z.object({
  rows: z.array(z.object({
    row, action: z.enum(["match", "new", "skip"]), personId: z.string().max(40).nullable(),
    group: z.enum(["", ...GROUPS]), useAddress: z.boolean(),
  })).min(1).max(3000),
  tags: z.object({ card: z.string().trim().min(1).max(60), family: z.string().trim().min(1).max(60), friend: z.string().trim().min(1).max(60), wife: z.string().trim().min(1).max(60) }),
  stage: z.string().trim().min(1).max(60),
});
export type ApplyInput = z.infer<typeof applySchema>;
