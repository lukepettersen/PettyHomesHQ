import "server-only";
import { db } from "@/server/db";
import { loadForm } from "@/server/pa";
import { isoFromDate } from "@/lib/normalize";
import { cleanRules, DEFAULT_RULES, type DateOption, type InviteContext, type InviteRule } from "@/lib/contractInvites";

// Admin → Calendar invites (SPEC.md §12). Rules live in AppSetting "calendar.invites"; none saved = today's defaults.
export const INVITES_KEY = "calendar.invites";

/** Every date question on the purchase agreement forms (both sides), in form order. */
export async function inviteDateOptions(): Promise<DateOption[]> {
  const out = new Map<string, DateOption>();
  for (const side of ["buyer", "seller"] as const) {
    for (const s of await loadForm(side)) for (const f of s.fields) {
      if ((f.type === "date" || f.type === "date-na" || f.type === "datetime") && !out.has(f.key)) out.set(f.key, { key: f.key, label: f.label, withTime: f.type === "datetime" });
    }
  }
  return [...out.values()];
}

export async function loadInviteRules(): Promise<InviteRule[]> {
  const row = await db.appSetting.findUnique({ where: { key: INVITES_KEY } });
  if (!row) return DEFAULT_RULES;
  try { return cleanRules(row.value, await inviteDateOptions()); } catch { return DEFAULT_RULES; }
}

type PaRow = { side: string; address: string; answers: unknown; finalAcceptance: Date | null; inspection: Date | null; writtenStatement: Date | null; writtenStatementNA: boolean; hoaRescission: Date | null; closing: Date | null };

/** A contract's dates by question key: the key-date columns plus date answers ("N/A" ones left out). */
export function inviteContext(pa: PaRow, personName: string): InviteContext {
  const answers = (pa.answers && typeof pa.answers === "object" && !Array.isArray(pa.answers) ? pa.answers : {}) as Record<string, string>;
  const d = (x: Date | null) => (x ? isoFromDate(x) : null);
  const dates: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(answers)) if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && answers[`${k}_na`] !== "yes") dates[k] = v;
  Object.assign(dates, { finalAcceptance: d(pa.finalAcceptance), inspection: d(pa.inspection), writtenStatement: pa.writtenStatementNA ? null : d(pa.writtenStatement), hoaRescission: d(pa.hoaRescission), closing: d(pa.closing) });
  return { personName, address: pa.address, side: pa.side === "seller" ? "seller" : "buyer", dates };
}
