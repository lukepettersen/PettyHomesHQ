// Industry partners (SPEC.md §6.4): realtors, lenders, title and others are contacts with a type and company,
// and purchase agreement people sections can be filled by picking one. Pure, unit tested in partners.test.ts.
import type { PaSection } from "./pa";

export const PARTNER_TYPES: [string, string][] = [
  ["realtor", "Realtor"], ["lender", "Lender"], ["title", "Title"], ["inspector", "Inspector"], ["tc", "Transaction coordinator"], ["attorney", "Attorney"], ["other", "Other partner"],
];
export const partnerLabel = (k: string | null | undefined) => PARTNER_TYPES.find(([x]) => x === k)?.[1] ?? null;
export const isPartnerType = (k: string) => PARTNER_TYPES.some(([x]) => x === k);

/** Which kind of partner a people section is for: "Buyer's lender" → lender, "Seller's title" → title, "Seller's agent" → realtor. */
export function sectionPartnerType(s: Pick<PaSection, "id" | "name">): string | null {
  const t = `${s.id} ${s.name}`.toLowerCase();
  if (/lender|loan|mortgage/.test(t)) return "lender";
  if (/title|closer|escrow/.test(t)) return "title";
  if (/\btc\b|coordinator/.test(t)) return "tc";
  if (/agent|realtor/.test(t)) return "realtor";
  if (/inspect/.test(t)) return "inspector";
  if (/attorney|lawyer/.test(t)) return "attorney";
  return null;
}

export type Partner = { id: string; name: string; company: string; email: string; phone: string };
type Slot = "name" | "company" | "email" | "phone" | "contact";
/** What a people-section question asks for, read from its label ("Company", "Email", "Contact", "Email/phone", "Name"). */
export function slotOf(label: string): Slot {
  const l = label.toLowerCase();
  if (/email\s*\/\s*phone|phone\s*\/\s*email|contact info/.test(l)) return "contact";
  if (/company|brokerage|office|firm/.test(l)) return "company";
  if (/e-?mail/.test(l)) return "email";
  if (/phone|cell|mobile/.test(l)) return "phone";
  return "name"; // "Name", "Contact", "Closer", "Loan officer"…
}

/** The answers a picked partner fills into one people section. */
export function fillFromPartner(s: PaSection, p: Partner): Record<string, string> {
  const value: Record<Slot, string> = { name: p.name, company: p.company, email: p.email, phone: p.phone, contact: [p.email, p.phone].filter(Boolean).join(" · ") };
  // Title sections ask "Company" then "Contact": with no person name the company still fills.
  return Object.fromEntries(s.fields.map((f) => [f.key, value[slotOf(f.label)] ?? ""]));
}

/** "+ Add new": the typed name goes in the section's name question (or company, if it only asks for a company). */
export function newPartnerFill(s: PaSection, name: string): Record<string, string> {
  const f = s.fields.find((x) => slotOf(x.label) === "name") ?? s.fields.find((x) => slotOf(x.label) === "company");
  return f ? { [f.key]: name.trim() } : {};
}

/** A new partner typed into a people section, read back from its answers (for "Save as contact"). */
export function partnerFromAnswers(s: PaSection, a: Record<string, string>): Omit<Partner, "id"> {
  const out = { name: "", company: "", email: "", phone: "" };
  for (const f of s.fields) {
    const v = (a[f.key] ?? "").trim();
    if (!v) continue;
    const slot = slotOf(f.label);
    if (slot === "contact") {
      for (const part of v.split(/[·,;]|\s{2,}/).map((x) => x.trim()).filter(Boolean)) {
        if (part.includes("@")) out.email ||= part;
        else if (part.replace(/\D/g, "").length >= 7) out.phone ||= part;
      }
    } else out[slot] ||= v;
  }
  if (!out.name && out.company) out.name = out.company; // a title company with no contact person
  return out;
}

/** Email addresses of the deal's people (lender, title, agents…) for one-click "To" buttons (owner request 2026-10-26). */
export function dealEmails(form: PaSection[], pa: { answers: Record<string, string>; partners: Record<string, { id: string; name: string }> }): { value: string; label: string; personId: string | null }[] {
  const out: { value: string; label: string; personId: string | null }[] = [];
  for (const s of form.filter((x) => x.people)) {
    const p = partnerFromAnswers(s, pa.answers);
    const email = p.email.toLowerCase();
    if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(email) || out.some((x) => x.value === email)) continue;
    out.push({ value: email, label: `${s.name}: ${p.name || p.company || pa.partners[s.id]?.name || email}`, personId: pa.partners[s.id]?.id ?? null });
  }
  return out;
}
