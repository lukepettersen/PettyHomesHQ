import { z } from "zod";

// Request paperwork (owner request 2026-11-04): ask a teammate (Alyssa) to write a form up in ClickContracts.
// The form list is the owner's: listing contract, amendment, change form, cancellation, cancel & relist, other.

export type PaperField = { key: string; label: string; type: "text" | "money" | "date" | "long"; when?: string[]; hint?: string };
export type PaperOption = { key: string; label: string };
export type PaperType = { key: string; label: string; fields: PaperField[]; options?: PaperOption[] };

const address: PaperField = { key: "address", label: "Property address", type: "text" };
const mls: PaperField = { key: "mls", label: "MLS #", type: "text" };
const lcDate: PaperField = { key: "lcDate", label: "Listing contract dated", type: "date", hint: "The original listing contract date" };
const offMarket: PaperField = { key: "offMarket", label: "Off-market date", type: "date" };
/** What can change on the NorthstarMLS Listing Change Form (owner 2026-11-05: price change needs the listing contract date). */
export const CHANGE_OPTIONS: PaperOption[] = [
  { key: "price", label: "Price change" }, { key: "expiration", label: "Expiration date change" }, { key: "temp", label: "Temp. not available for showing" },
  { key: "active", label: "Back to Active" }, { key: "cancelled", label: "Cancelled" }, { key: "other", label: "Something else" },
];
export const PAPER_TYPES: PaperType[] = [
  { key: "listing", label: "Listing contract", fields: [address, { key: "price", label: "List price", type: "money" }, { key: "start", label: "Listing starts", type: "date" }, { key: "end", label: "Listing expires", type: "date" }] },
  { key: "amendment", label: "Amendment", fields: [address, { key: "changes", label: "What's changing", type: "long" }] },
  { key: "change", label: "Change form", options: CHANGE_OPTIONS, fields: [
    address, mls, lcDate,
    { key: "price", label: "Current list price", type: "money", when: ["price"] }, { key: "newPrice", label: "New list price", type: "money", when: ["price"] },
    { key: "oldExpires", label: "Old expiration date", type: "date", when: ["expiration"] }, { key: "newExpires", label: "New expiration date", type: "date", when: ["expiration"] },
    { ...offMarket, when: ["temp", "cancelled"] }, { key: "changes", label: "Other changes", type: "long", when: ["other"], hint: 'Like "Bedrooms = 4"' },
  ] },
  { key: "cancel", label: "Cancellation", fields: [address, mls, lcDate, offMarket, { key: "reason", label: "Why it's cancelling", type: "long" }] },
  { key: "relist", label: "Cancel & relist", fields: [address, mls, lcDate, offMarket, { key: "newPrice", label: "New list price", type: "money" }, { key: "start", label: "New listing starts", type: "date" }, { key: "end", label: "New listing expires", type: "date" }] },
  { key: "other", label: "Other", fields: [{ key: "form", label: "Which form", type: "text" }, address] },
];

/** The boxes checked on a Change form ("price,expiration" in values.checks). */
export const checksOf = (values: Record<string, string>) => (values.checks ?? "").split(",").map((x) => x.trim()).filter(Boolean);
/** Fields to show: those with no "when", or whose option is checked. */
export const shownFields = (t: PaperType, values: Record<string, string>) => { const c = checksOf(values); return t.fields.filter((f) => !f.when || f.when.some((w) => c.includes(w))); };

// ---------- Steps (editable in Admin → Paperwork steps; AppSetting "paperwork.steps") ----------

/** One step; `when` is a Change form option it only applies to ("" = always). {address}, {newPrice}… fill in from the request. */
export type PaperStep = { text: string; when: string };
export type PaperSteps = Record<string, PaperStep[]>;
const st = (text: string, when = ""): PaperStep => ({ text, when });
const TOP = st("Fill the top: Listing Number {mls}, Address {address}, Listing Office ID, Listing Agent ID and Listing Agent Name.");
const CHANGE_FORM = st("In ClickContracts, open the NorthstarMLS Listing Change Form and Contract Amendment for {address}.");
const DATED = st('Fill in "listing contract dated" with the original listing contract date: {lcDate}.');
export const DEFAULT_STEPS: PaperSteps = {
  listing: [st("In ClickContracts, open a new listing contract for {client}."), st("Property {address}, list price {price}."), st("Listing starts {start} and expires {end}."), st("Send it for signatures.")],
  amendment: [st("In ClickContracts, open an amendment to the purchase agreement for {address}."), st("Write in the changes: {changes}"), st("Send it for signatures.")],
  change: [
    CHANGE_FORM, TOP,
    st("Check Price Change and enter the New List Price: {newPrice} (was {price}).", "price"),
    st("Check Expiration Date Change: Old Expiration Date {oldExpires}, New Expiration Date {newExpires}. If the old date has passed, it must be signed within 7 days of it; after that it has to be a new listing.", "expiration"),
    st("Check Status Change → Temp. Not Avail. For Showing, Off-Market Date {offMarket}.", "temp"),
    st("Check Status Change → Active.", "active"),
    st("Check Status Change → Cancelled, Off-Market Date {offMarket}. The owners and the broker must sign to cancel.", "cancelled"),
    st('Under OTHER, write each change as "Field = value": {changes}', "other"),
    DATED, st("Send it for signatures (owners and agent)."),
  ],
  cancel: [CHANGE_FORM, TOP, st("Check Status Change → Cancelled, Off-Market Date {offMarket}."), DATED, st("Send it for signatures. The owners and the broker must sign to cancel.")],
  relist: [CHANGE_FORM, TOP, st("Check Status Change → Cancelled, Off-Market Date {offMarket}."), DATED, st("Open a new listing contract for {client}: list price {newPrice}, starts {start}, expires {end}."), st("Send both for signatures. The owners and the broker must sign to cancel.")],
  other: [st("In ClickContracts, open {form} for {address}."), st("Send it for signatures.")],
};

export type PaperConfig = { steps: PaperSteps; custom: PaperType[] };

/** The saved setup: steps per form (defaults for built-in forms with none saved) and the owner's own forms. */
export function cleanConfig(v: unknown): PaperConfig {
  const src = v && typeof v === "object" ? (v as { steps?: unknown; custom?: unknown }) : {};
  const custom = (Array.isArray(src.custom) ? src.custom : []).map((c) => (c && typeof c === "object" ? c as { key?: unknown; label?: unknown } : {}))
    .filter((c) => typeof c.key === "string" && /^c_[a-z0-9]{4,24}$/.test(c.key) && typeof c.label === "string" && c.label.trim())
    .slice(0, 40).map((c) => customType(String(c.key), String(c.label).trim().slice(0, 60)));
  const saved = src.steps && typeof src.steps === "object" ? (src.steps as Record<string, unknown>) : {};
  const steps: PaperSteps = {};
  for (const t of allTypes(custom)) {
    const rows = Array.isArray(saved[t.key]) ? (saved[t.key] as unknown[]) : null;
    const opts = (t.options ?? []).map((o) => o.key);
    steps[t.key] = rows
      ? rows.map((r) => (r && typeof r === "object" ? r as Partial<PaperStep> : {})).map((r) => ({ text: String(r.text ?? "").trim().slice(0, 500), when: opts.includes(String(r.when)) ? String(r.when) : "" })).filter((r) => r.text).slice(0, 40)
      : DEFAULT_STEPS[t.key] ?? [];
  }
  return { steps, custom };
}

/** The placeholders a form's steps can use, for the Admin hint. */
export const placeholdersFor = (t: PaperType) => ["client", ...t.fields.map((f) => f.key), "notes"];

/** Forms the owner added in Admin → Paperwork steps: a name and steps, with the property address to fill in. */
export const customType = (key: string, label: string): PaperType => ({ key, label, fields: [address] });
/** Every form in the Request paperwork pop-up: the built-in ones, the owner's own, then Other. */
export const allTypes = (custom: PaperType[] = []) => [...PAPER_TYPES.filter((t) => t.key !== "other"), ...custom, PAPER_TYPES.find((t) => t.key === "other")!];
export const paperType = (key: string, custom: PaperType[] = []) => allTypes(custom).find((t) => t.key === key) ?? null;

export const paperSchema = z.object({
  type: z.string().refine((k) => !!paperType(k) || /^c_[a-z0-9]{4,24}$/.test(k), "Pick which form."),
  values: z.record(z.string(), z.string().trim().max(2000)).default({}),
  notes: z.string().trim().max(4000).default(""),
});
export type PaperRequest = z.infer<typeof paperSchema>;

const money = (v: string) => { const n = Number(v.replace(/[$,\s]/g, "")); return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString("en-US")}` : v; };
const day = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : v; };
const show = (f: PaperField, v: string) => (f.type === "money" ? money(v) : f.type === "date" ? day(v) : v);

/** The form's name as it reads in the task ("listing contract", or what they typed for Other). */
export function formName(r: PaperRequest, custom: PaperType[] = []): string {
  const t = paperType(r.type, custom);
  if (!t) return "a form";
  return t.key === "other" ? (r.values.form?.trim() || "a form") : t.label.toLowerCase();
}

/** The task title: "Write up listing contract in ClickContracts · Jane Smith". */
export function paperTitle(r: PaperRequest, personName: string, custom: PaperType[] = []): string {
  return `Write up ${formName(r, custom)} in ClickContracts · ${personName}`;
}

/** What's filled in, one per line ("List price: $350,000"), then the notes. Blank fields are left out. */
export function paperDetails(r: PaperRequest, custom: PaperType[] = []): string {
  const t = paperType(r.type, custom);
  if (!t) return r.notes ? `Notes: ${r.notes}` : "";
  const checks = checksOf(r.values).map((k) => t.options?.find((o) => o.key === k)?.label).filter(Boolean);
  const lines = [...(checks.length ? [`Changing: ${checks.join(", ")}`] : []), ...shownFields(t, r.values).filter((f) => f.key !== "form" && r.values[f.key]?.trim()).map((f) => `${f.label}: ${show(f, r.values[f.key].trim())}`)];
  if (r.notes) lines.push(`Notes: ${r.notes}`);
  return lines.join("\n");
}

/** Something to act on: Other needs its form named, and there has to be an address or a note. */
export function paperProblem(r: PaperRequest, custom: PaperType[] = []): string | null {
  if (!paperType(r.type, custom)) return "That form was removed. Pick another.";
  if (r.type === "other" && !r.values.form?.trim()) return "Say which form.";
  if (!r.values.address?.trim() && !r.notes) return "Add the property address or a note.";
  if (r.type === "change" && !checksOf(r.values).length) return "Check what's changing.";
  return null;
}

/** The text to the teammate's cell. A YES reply checks the task off. */
export function paperText(r: PaperRequest, personName: string, from: string, custom: PaperType[] = []): string {
  const d = paperDetails(r, custom);
  return `HQ: ${from} needs ${aOrAn(formName(r, custom))} for ${personName} in ClickContracts.${d ? `\n${d}` : ""}\nThe steps are on the task in HQ. Reply YES when it's written up and ready to sign.`;
}

/** "an amendment", "a listing contract". */
export const aOrAn = (s: string) => (/^(a |an |the )/i.test(s) ? s : `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`);

/**
 * The steps for this request with its values filled in: steps for unchecked Change form boxes are left out, and a
 * blank value reads "____" (the listing contract date says where to find it).
 */
export function paperSteps(r: PaperRequest, personName: string, steps: PaperSteps, custom: PaperType[] = []): string[] {
  const t = paperType(r.type, custom);
  if (!t) return [];
  const checks = checksOf(r.values);
  const fieldOf = (k: string) => t.fields.find((f) => f.key === k);
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (k === "client") return personName;
    if (k === "notes") return r.notes || "____";
    const v = r.values[k]?.trim();
    if (v) { const f = fieldOf(k); return f ? show(f, v) : v; }
    return k === "lcDate" ? "____ (find it on the signed listing contract)" : "____";
  });
  return (steps[t.key] ?? []).filter((s) => !s.when || checks.includes(s.when)).map((s) => fill(s.text));
}

export const SOURCE_PREFIX = "paperwork:";
