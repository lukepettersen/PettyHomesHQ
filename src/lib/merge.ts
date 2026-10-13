// Merge fields for text and email templates (SPEC.md §8, §13). Pure, unit tested in merge.test.ts.
// Commission and BAC are never merge fields.

export const MERGE_FIELDS: [string, string][] = [
  ["first_name", "Client first name(s)"], ["last_name", "Client last name"], ["full_name", "Client full name"], ["mailing_name", "Mailing name"],
  ["address", "Property address"], ["price", "Purchase or list price"],
  ["final_acceptance_date", "Final Acceptance"], ["inspection_date", "Inspection deadline"], ["inspection_appointment", "Inspection appointment"],
  ["written_statement_date", "Written Statement"], ["closing_date", "Closing date"],
  ["lender_name", "Lender"], ["title_company", "Title company"],
  ["agent_name", "Luke's full name"], ["agent_first_name", "Luke's first name"], ["assistant_name", "Assistant's name"], ["my_name", "Your name"],
];

export type MergeCtx = {
  personName: string; mailingName?: string | null;
  address?: string | null; price?: number | null;
  dates?: Partial<Record<"finalAcceptance" | "inspection" | "writtenStatement" | "closing", string | null>>;
  inspAppt?: string | null; lender?: string | null; titleCompany?: string | null;
  agentName?: string; assistantName?: string; myName?: string;
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
  return {
    first_name: first, last_name: last, full_name: c.personName, mailing_name: c.mailingName || c.personName,
    address: c.address ?? "", price: c.price ? `$${c.price.toLocaleString("en-US")}` : "",
    final_acceptance_date: d.finalAcceptance ? longDate(d.finalAcceptance) : "", inspection_date: d.inspection ? longDate(d.inspection) : "",
    written_statement_date: d.writtenStatement ? longDate(d.writtenStatement) : "", closing_date: d.closing ? longDate(d.closing) : "",
    inspection_appointment: c.inspAppt ? `${longDate(c.inspAppt)} at ${clock(c.inspAppt.slice(11, 16))}` : "",
    lender_name: c.lender ?? "", title_company: c.titleCompany ?? "",
    agent_name: c.agentName ?? "", agent_first_name: (c.agentName ?? "").split(/\s+/)[0], assistant_name: c.assistantName ?? "", my_name: c.myName ?? "",
  };
}

/** Fills {fields}; returns the text and any fields that had nothing to fill in. Unknown {words} are left as typed. */
export function fill(text: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
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
};
