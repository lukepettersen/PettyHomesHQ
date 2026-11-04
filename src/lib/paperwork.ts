import { z } from "zod";

// Request paperwork (owner request 2026-11-04): ask a teammate (Alyssa) to write a form up in ClickContracts.
// The form list is the owner's: listing contract, amendment, change form, cancellation, cancel & relist, other.

export type PaperField = { key: string; label: string; type: "text" | "money" | "date" | "long" };
export type PaperType = { key: string; label: string; fields: PaperField[] };

const address: PaperField = { key: "address", label: "Property address", type: "text" };
export const PAPER_TYPES: PaperType[] = [
  { key: "listing", label: "Listing contract", fields: [address, { key: "price", label: "List price", type: "money" }, { key: "start", label: "Listing starts", type: "date" }, { key: "end", label: "Listing expires", type: "date" }] },
  { key: "amendment", label: "Amendment", fields: [address, { key: "changes", label: "What's changing", type: "long" }] },
  { key: "change", label: "Change form", fields: [address, { key: "price", label: "New list price", type: "money" }, { key: "changes", label: "Other changes", type: "long" }] },
  { key: "cancel", label: "Cancellation", fields: [address, { key: "reason", label: "Why it's cancelling", type: "long" }] },
  { key: "relist", label: "Cancel & relist", fields: [address, { key: "price", label: "New list price", type: "money" }, { key: "start", label: "New listing starts", type: "date" }, { key: "end", label: "New listing expires", type: "date" }] },
  { key: "other", label: "Other", fields: [{ key: "form", label: "Which form", type: "text" }, address] },
];

export const paperType = (key: string) => PAPER_TYPES.find((t) => t.key === key) ?? null;

export const paperSchema = z.object({
  type: z.string().refine((k) => !!paperType(k), "Pick which form."),
  values: z.record(z.string(), z.string().trim().max(2000)).default({}),
  notes: z.string().trim().max(4000).default(""),
});
export type PaperRequest = z.infer<typeof paperSchema>;

const money = (v: string) => { const n = Number(v.replace(/[$,\s]/g, "")); return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString("en-US")}` : v; };
const day = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : v; };
const show = (f: PaperField, v: string) => (f.type === "money" ? money(v) : f.type === "date" ? day(v) : v);

/** The form's name as it reads in the task ("listing contract", or what they typed for Other). */
export function formName(r: PaperRequest): string {
  const t = paperType(r.type)!;
  return t.key === "other" ? (r.values.form?.trim() || "a form") : t.label.toLowerCase();
}

/** The task title: "Write up listing contract in ClickContracts · Jane Smith". */
export function paperTitle(r: PaperRequest, personName: string): string {
  return `Write up ${formName(r)} in ClickContracts · ${personName}`;
}

/** What's filled in, one per line ("List price: $350,000"), then the notes. Blank fields are left out. */
export function paperDetails(r: PaperRequest): string {
  const t = paperType(r.type)!;
  const lines = t.fields.filter((f) => f.key !== "form" && r.values[f.key]?.trim()).map((f) => `${f.label}: ${show(f, r.values[f.key].trim())}`);
  if (r.notes) lines.push(`Notes: ${r.notes}`);
  return lines.join("\n");
}

/** Something to act on: Other needs its form named, and there has to be an address or a note. */
export function paperProblem(r: PaperRequest): string | null {
  if (r.type === "other" && !r.values.form?.trim()) return "Say which form.";
  if (!r.values.address?.trim() && !r.notes) return "Add the property address or a note.";
  return null;
}

/** The text to the teammate's cell. A YES reply checks the task off. */
export function paperText(r: PaperRequest, personName: string, from: string): string {
  const d = paperDetails(r);
  return `HQ: ${from} needs ${aOrAn(formName(r))} for ${personName} in ClickContracts.${d ? `\n${d}` : ""}\nReply YES when it's written up and ready to sign.`;
}

/** "an amendment", "a listing contract". */
export const aOrAn = (s: string) => (/^(a |an |the )/i.test(s) ? s : `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`);

export const SOURCE_PREFIX = "paperwork:";
