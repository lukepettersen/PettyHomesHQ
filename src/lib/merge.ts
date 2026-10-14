// Merge fields for text and email templates (SPEC.md §8, §13). Pure, unit tested in merge.test.ts.
// Every question on the purchase agreement and buyer/listing forms is a merge field too (formMergeFields);
// commission and BAC fill in only for people with "See commissions".
import type { PaSection } from "./pa";

export const MERGE_FIELDS: [string, string][] = [
  ["first_name", "Client first name(s)"], ["last_name", "Client last name"], ["full_name", "Client full name"], ["mailing_name", "Mailing name"],
  ["primary_first_name", "First person's first name"], ["partner_first_name", "Spouse/partner's first name"],
  ["email", "Client email"], ["phone", "Client phone"], ["street", "Client street address"], ["city", "Client city"],
  ["address", "Property address"], ["price", "Purchase or list price"],
  ["final_acceptance_date", "Final Acceptance"], ["inspection_date", "Inspection deadline"], ["inspection_appointment", "Inspection appointment"],
  ["written_statement_date", "Written Statement"], ["closing_date", "Closing date"],
  ["lender_name", "Lender"], ["title_company", "Title company"],
  ["agent_name", "Luke's full name"], ["agent_first_name", "Luke's first name"], ["assistant_name", "Assistant's name"], ["my_name", "Your name"], ["my_first_name", "Your first name"],
];

export type MergeCtx = {
  personName: string; mailingName?: string | null;
  email?: string | null; phone?: string | null; homeAddress?: string | null; // the contact's own (not the deal's)
  address?: string | null; price?: number | null;
  dates?: Partial<Record<"finalAcceptance" | "inspection" | "writtenStatement" | "closing", string | null>>;
  inspAppt?: string | null; lender?: string | null; titleCompany?: string | null;
  agentName?: string; assistantName?: string; myName?: string;
  extra?: Record<string, string>; // answers from the contract and file, already formatted (formValues)
};

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "2026-11-20" → "Friday, November 20" */
export function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };

/** "Sam & Lena Ortiz" → first "Sam & Lena", last "Ortiz"; "Sam Ortiz & Lena Brooks" → "Sam & Lena", "Ortiz/Brooks". */
export function nameParts(name: string): { first: string; last: string } {
  const parts = name.split("&").map((p) => p.trim().split(/\s+/)).filter((p) => p[0]);
  const firsts = parts.map((p) => p[0]);
  const lasts = [...new Set(parts.filter((p) => p.length > 1).map((p) => p[p.length - 1]))];
  return { first: firsts.join(" & "), last: lasts.join("/") };
}

export function mergeValues(c: MergeCtx): Record<string, string> {
  const { first, last } = nameParts(c.personName);
  const d = c.dates ?? {};
  const firsts = c.personName.split("&").map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
  const home = (c.homeAddress ?? "").split(",").map((x) => x.trim());
  const base: Record<string, string> = {
    primary_first_name: firsts[0] ?? "", partner_first_name: firsts[1] ?? "",
    email: c.email ?? "", phone: c.phone ?? "", street: home[0] ?? "", city: home[1] ?? "", my_first_name: (c.myName ?? "").split(/\s+/)[0],
    first_name: first, last_name: last, full_name: c.personName, mailing_name: c.mailingName || c.personName,
    address: c.address ?? "", price: c.price ? `$${c.price.toLocaleString("en-US")}` : "",
    final_acceptance_date: d.finalAcceptance ? longDate(d.finalAcceptance) : "", inspection_date: d.inspection ? longDate(d.inspection) : "",
    written_statement_date: d.writtenStatement ? longDate(d.writtenStatement) : "", closing_date: d.closing ? longDate(d.closing) : "",
    inspection_appointment: c.inspAppt ? `${longDate(c.inspAppt)} at ${clock(c.inspAppt.slice(11, 16))}` : "",
    lender_name: c.lender ?? "", title_company: c.titleCompany ?? "",
    agent_name: c.agentName ?? "", agent_first_name: (c.agentName ?? "").split(/\s+/)[0], assistant_name: c.assistantName ?? "", my_name: c.myName ?? "",
  };
  // Form answers fill in everything else; the built-in fields win when they have a value.
  const out = { ...c.extra };
  for (const [k, v] of Object.entries(base)) if (v || !out[k]) out[k] = v;
  return out;
}

/** Friendlier names for the built-in form questions; any other question uses its key in snake_case. */
const ALIAS: Record<string, string> = {
  closing: "closing_date", finalAcceptance: "final_acceptance_date", inspection: "inspection_date", writtenStatement: "written_statement_date",
  hoaRescission: "hoa_rescission_date", inspAppt: "inspection_appointment", lenderName: "lender_name", lender: "lender_name", titleCompany: "title_company",
  titleContact: "title_contact", titleContactInfo: "title_contact_info", sTitleCompany: "seller_title_company", sTitleContact: "seller_title_contact",
  sAgentName: "seller_agent_name", sAgentEmail: "seller_agent_email", bAgentName: "buyer_agent_name", bAgentEmail: "buyer_agent_email",
  sTcName: "seller_tc_name", sTcContact: "seller_tc_contact", em: "earnest_money", sc: "seller_contributions", fin: "financing", emTo: "earnest_money_to",
  ptype: "property_type", year: "year_built", newc: "new_construction", hoa: "hoa", referral: "referral_fee", defect: "material_defect_clause",
  lotPlan: "lot_plan", estCompletion: "estimated_completion", registered: "registered_with_builder", builderRepContact: "builder_rep_contact",
  repSigned: "buyer_rep_signed", repExpires: "buyer_rep_expires", lcSigned: "listing_signed", lcExpires: "listing_expires", range: "price_range",
  respond: "response_deadline", consult: "consult_date", photos: "photos_date", active: "active_date",
};
export const mergeKey = (k: string) => ALIAS[k] ?? k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9_]/g, "_");

export type MergeField = { key: string; label: string; group: string };
const CLIENT = ["first_name", "last_name", "full_name", "mailing_name"], TEAM = ["agent_name", "agent_first_name", "assistant_name", "my_name"];
const labelOf = (k: string) => MERGE_FIELDS.find(([x]) => x === k)![1];

/** Every merge field, grouped: client, each form's questions (first form to ask wins), then the team. */
export function formMergeFields(forms: { group: string; sections: PaSection[] }[]): MergeField[] {
  const out: MergeField[] = CLIENT.map((key) => ({ key, label: labelOf(key), group: "Client" }));
  const seen = new Set([...CLIENT, ...TEAM]);
  const add = (f: MergeField) => { if (!seen.has(f.key)) { seen.add(f.key); out.push(f); } };
  for (const { group, sections } of forms) for (const s of sections) for (const q of s.fields) {
    add({ key: mergeKey(q.key), label: s.people ? `${s.name} · ${q.label}` : q.label, group });
    if (q.key === "commission") add({ key: "commission_amount", label: "Commission ($, from % × price)", group });
  }
  for (const [key, label] of MERGE_FIELDS) add({ key, label, group: "Contract" }); // built-ins a form no longer asks
  for (const key of TEAM) out.push({ key, label: labelOf(key), group: "Team" });
  return out;
}

const num = (v: string) => Number(v.replace(/[$,%\s]/g, ""));
/** Form answers → merge values, written the friendly way (money, dates, 12-hour times). */
export function formValues(sections: PaSection[], a: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of sections.flatMap((s) => s.fields)) {
    const v = (a[q.key] ?? "").trim(), k = mergeKey(q.key);
    if (q.type === "date-na" && a[`${q.key}_na`] === "yes") { out[k] = "N/A"; continue; }
    if (!v) { out[k] ??= ""; continue; }
    out[k] = q.type === "money" && num(v) ? `$${num(v).toLocaleString("en-US")}`
      : q.type === "pct" && !v.includes("%") ? `${v}%`
      : (q.type === "date" || q.type === "date-na") && /^\d{4}-\d{2}-\d{2}/.test(v) ? longDate(v)
      : q.type === "datetime" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? `${longDate(v)} at ${clock(v.slice(11, 16))}`
      : v;
  }
  const pct = num(a.commission ?? ""), price = num(a.price ?? "");
  out.commission_amount = pct > 0 && pct < 20 && price ? `$${Math.round((price * pct) / 100).toLocaleString("en-US")}` : "";
  return out;
}

/** Fills {fields}; returns the text and any fields that had nothing to fill in. Unknown {words} are left as typed. */
export function fill(text: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{([a-z0-9_]+)\}/g, (whole, key: string) => {
    if (!(key in values)) return whole;
    if (!values[key]) { missing.add(key); return ""; }
    return values[key];
  });
  return { text: out, missing: [...missing] };
}

/** Sample values for the template preview in Admin. */
export const SAMPLE: MergeCtx = {
  personName: "Sam & Lena Ortiz", address: "2215 Hillside Ave, Edina", price: 389000,
  dates: { finalAcceptance: "2026-10-01", inspection: "2026-10-20", writtenStatement: "2026-11-01", closing: "2026-11-20" },
  inspAppt: "2026-10-16T10:00", lender: "Pat Lee", titleCompany: "Edina Title", agentName: "Luke Pettersen", assistantName: "Alyssa Chakiton", myName: "Alyssa Chakiton",
  extra: { earnest_money: "$5,000", seller_contributions: "$3,000", commission: "2.7%", bac: "$695", commission_amount: "$10,503", financing: "Conventional",
    buyer_agent_name: "Jordan Reyes", buyer_agent_email: "jordan@example.com", seller_agent_name: "Casey Moore", title_contact: "Kim Olson", hoa_rescission_date: "Monday, October 12" },
};
/** Preview values: the sample, and "[Question]" for anything the sample doesn't cover. */
export const sampleValues = (fields: MergeField[]) => ({ ...Object.fromEntries(fields.map((f) => [f.key, `[${f.label}]`])), ...mergeValues(SAMPLE) });
