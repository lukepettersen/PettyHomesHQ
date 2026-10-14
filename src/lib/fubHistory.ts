// Copying FUB templates and history (SPEC.md §15). Pure, unit tested in fubHistory.test.ts.
import { htmlToText } from "./email";

/** FUB merge fields → HQ merge fields. Anything else is left as typed and reported. */
const FIELDS: Record<string, string> = {
  contact_first_name: "first_name", contact_firstname: "first_name", first_name: "first_name", firstname: "first_name",
  contact_last_name: "last_name", contact_lastname: "last_name", last_name: "last_name", lastname: "last_name",
  contact_name: "full_name", contact_full_name: "full_name", name: "full_name", full_name: "full_name",
  agent_first_name: "agent_first_name", agent_name: "agent_name", agent_full_name: "agent_name",
  user_first_name: "my_name", user_name: "my_name", my_name: "my_name",
  property_address: "address", contact_address: "address", address: "address",
};
export function convertMergeFields(text: string): { text: string; unknown: string[] } {
  const unknown = new Set<string>();
  const out = text.replace(/%([a-z0-9_]+)%/gi, (whole, key: string) => {
    const k = FIELDS[key.toLowerCase()];
    if (k) return `{${k}}`;
    unknown.add(whole);
    return whole;
  });
  return { text: out, unknown: [...unknown] };
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"');
/** A FUB email template's HTML → HQ's light formatting: **bold**, [words](link), "- " lists, line breaks. */
export function htmlToMarkup(html: string): string {
  if (!/<[a-z][\s\S]*>/i.test(html)) return decode(html).trim();
  return decode(html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a [^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, u: string, t: string) => { const txt = t.replace(/<[^>]+>/g, "").trim(); return txt && txt !== u ? `[${txt}](${u})` : u; })
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, (_, __, t: string) => { const txt = t.replace(/<[^>]+>/g, "").trim(); return txt ? `**${txt}**` : ""; })
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|ul|ol|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** "BPC - Consult Scheduled Confirmation" → folder "BPC". */
export function folderOf(name: string): string {
  const m = /^\s*(BPC|BUC|SPC|SUC|Leads?)\b/i.exec(name);
  return m ? (m[1].toLowerCase().startsWith("lead") ? "Leads" : m[1].toUpperCase()) : "";
}

export type HistoryEntry = { key: string; kind: "note" | "call" | "text"; body: string; outcome: string | null; createdAt: string; author: string };
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const when = (r: Record<string, unknown>) => { const t = Date.parse(str(r.created) || str(r.sent) || str(r.updated)); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/** A FUB note / call / text → a timeline entry (null if there's nothing to show). */
export function noteEntry(r: Record<string, unknown>): HistoryEntry | null {
  const at = when(r), body = [str(r.subject).trim(), htmlToText(str(r.body))].filter(Boolean).join("\n\n");
  return at && body ? { key: `note:${str(r.id)}`, kind: "note", body: body.slice(0, 10000), outcome: null, createdAt: at, author: str(r.createdBy) } : null;
}
export function callEntry(r: Record<string, unknown>): HistoryEntry | null {
  const at = when(r);
  if (!at) return null;
  const secs = Number(r.duration) || 0, dir = r.isIncoming ? "Incoming call" : "Call";
  const len = secs ? ` · ${secs >= 60 ? `${Math.round(secs / 60)} min` : `${secs} sec`}` : "";
  const note = htmlToText(str(r.note)).trim();
  return { key: `call:${str(r.id)}`, kind: "call", body: `${dir}${len}${note ? `\n\n${note}` : ""}`.slice(0, 10000), outcome: str(r.outcome) || null, createdAt: at, author: str(r.userName) || str(r.createdBy) };
}
export function textEntry(r: Record<string, unknown>): HistoryEntry | null {
  const at = when(r), msg = str(r.message).trim();
  return at && msg ? { key: `text:${str(r.id)}`, kind: "text", body: `${r.isIncoming ? "They texted" : "Texted them"}: ${msg}`.slice(0, 10000), outcome: null, createdAt: at, author: r.isIncoming ? "" : str(r.userName) || str(r.createdBy) } : null;
}
