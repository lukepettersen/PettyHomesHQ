// Automatic texts/emails from checklist steps (owner request 2026-10-29): who they go to. Pure, tested.

export type DealPersonContact = { sectionId: string; role: string; name: string; email: string; phone: string };
export type TeamContact = { first: string; name: string; email: string; cell: string | null };
export type Recipients = { numbers: string[]; emails: string[]; names: string[]; missing: string[] };

const digits = (s: string) => { const d = s.replace(/\D/g, ""); return d.length === 11 && d.startsWith("1") ? d.slice(1) : d; };

/** Turns a step's "to" list into numbers (texts) or emails, with names for the timeline and what had nothing on file. */
export function resolveRecipients(kind: "text" | "email", keys: string[], ctx: {
  clientName: string; clientPhones: string[]; clientEmails: string[]; deal: DealPersonContact[]; team: TeamContact[];
}): Recipients {
  const out: Recipients = { numbers: [], emails: [], names: [], missing: [] };
  const add = (name: string, phone: string | null | undefined, email: string | null | undefined) => {
    const v = kind === "text" ? (phone ? digits(phone) : "") : (email ?? "").trim().toLowerCase();
    if (!v || (kind === "text" && v.length !== 10) || (kind === "email" && !/^\S+@\S+\.\S+$/.test(v))) { out.missing.push(name); return; }
    const list = kind === "text" ? out.numbers : out.emails;
    if (!list.includes(v)) { list.push(v); if (!out.names.includes(name)) out.names.push(name); }
  };
  for (const k of keys) {
    if (k === "client") {
      const list = kind === "text" ? ctx.clientPhones : ctx.clientEmails;
      if (!list.length) out.missing.push(ctx.clientName);
      for (const x of list) add(ctx.clientName, kind === "text" ? x : null, kind === "email" ? x : null);
    } else if (k.startsWith("people:")) {
      const p = ctx.deal.find((d) => d.sectionId === k.slice(7));
      if (p) add(p.name || p.role, p.phone, p.email); // a role the contract doesn't have (e.g. seller's title on a buyer deal) is skipped
    } else if (k.startsWith("team:")) {
      const t = ctx.team.find((m) => m.first.toLowerCase() === k.slice(5).toLowerCase());
      if (t) add(t.first, t.cell, t.email);
    }
  }
  return out;
}

/** "Emma, Vy and Luke" style list for labels. */
export function toLabel(keys: string[], labels: Record<string, string>): string {
  return keys.map((k) => labels[k] ?? k.replace(/^(people|team):/, "")).join(", ");
}
