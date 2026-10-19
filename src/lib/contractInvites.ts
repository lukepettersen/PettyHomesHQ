// Contract calendar invites (SPEC.md §12): which purchase agreement dates go on Google Calendar, how each
// event is titled, all day or at a time, and who's invited. Edited in Admin → Calendar invites.
// Pure, unit tested in contractInvites.test.ts.
import { apptName } from "@/lib/appointments";
import { splitCouple } from "@/lib/normalize";

export type InviteRule = {
  id: string;
  on: boolean;
  date: string; // a purchase agreement date question: finalAcceptance, inspection, closing, inspAppt…
  title: string; // with {last_name}, {first_name}, {client_name}, {address}, {street}
  time: string; // "" = all day, "form" = the time entered on the form (date-and-time questions), "HH:MM" = that time
  side: "both" | "buyer" | "seller";
  team: boolean; // invite Luke and Alyssa (everyone on the team)
  client: boolean; // invite the client's email addresses
};

/** Today's four invites. Their ids match the calendar links already made, so existing events are kept. */
export const DEFAULT_RULES: InviteRule[] = [
  { id: "inspection", on: true, date: "inspAppt", title: "{last_name} - Inspection", time: "form", side: "both", team: true, client: true },
  { id: "inspection-deadline-at-pm", on: true, date: "inspection", title: "{last_name} - Inspection Deadline at 11:59pm", time: "", side: "both", team: true, client: true },
  { id: "written-statement-deadline", on: true, date: "writtenStatement", title: "{last_name} - Written Statement Deadline", time: "", side: "both", team: true, client: true },
  { id: "close-date-hold", on: true, date: "closing", title: "{last_name} - Close Date HOLD", time: "", side: "both", team: true, client: true },
];

export const TITLE_FIELDS: [string, string][] = [["last_name", "Last name(s)"], ["first_name", "First name(s)"], ["client_name", "Client name"], ["address", "Property address"], ["street", "Street only"]];

export type DateOption = { key: string; label: string; withTime: boolean };
export type InviteContext = { personName: string; address: string; side: "buyer" | "seller"; dates: Record<string, string | null | undefined> };
export type ContractEvent = { ruleId: string; title: string; date: string; start: string | null; team: boolean; client: boolean };

/** Fills {last_name} etc. Unknown fields are left as typed so a mistake is visible. */
export function fillTitle(pattern: string, ctx: Pick<InviteContext, "personName" | "address">): string {
  const firsts = splitCouple(ctx.personName).map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).join(" & ");
  const values: Record<string, string> = { last_name: apptName(ctx.personName), first_name: firsts, client_name: ctx.personName, address: ctx.address, street: ctx.address.split(",")[0].trim() };
  return pattern.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m).replace(/\s+/g, " ").trim();
}

/** The events one contract should have, from the rules. A rule whose date isn't filled in yet makes nothing. */
export function contractEvents(rules: InviteRule[], ctx: InviteContext): ContractEvent[] {
  const out: ContractEvent[] = [];
  for (const r of rules) {
    if (!r.on || (r.side !== "both" && r.side !== ctx.side)) continue;
    const v = ctx.dates[r.date];
    if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) continue;
    const formTime = /T\d{2}:\d{2}/.test(v) ? v.slice(11, 16) : null;
    const start = r.time === "form" ? formTime : /^\d{2}:\d{2}$/.test(r.time) ? r.time : null;
    out.push({ ruleId: r.id, title: fillTitle(r.title, ctx), date: v.slice(0, 10), start, team: r.team, client: r.client });
  }
  return out;
}

/** Checks rules from the Admin page. Throws a message the person can fix. */
export function cleanRules(raw: unknown, options: DateOption[]): InviteRule[] {
  if (!Array.isArray(raw)) throw new Error("Something went wrong. Reload and try again.");
  if (raw.length > 40) throw new Error("That's a lot of invites. Keep it to 40.");
  const keys = new Map(options.map((o) => [o.key, o]));
  const seen = new Set<string>();
  return raw.map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : `r${i}`;
    if (seen.has(id)) throw new Error("Two invites have the same id. Reload and try again.");
    seen.add(id);
    const title = typeof r.title === "string" ? r.title.trim().slice(0, 160) : "";
    if (!title) throw new Error(`Invite ${i + 1}: give it a title.`);
    const date = typeof r.date === "string" ? r.date : "";
    const opt = keys.get(date);
    if (!opt) throw new Error(`"${title}": pick which date it's for.`);
    const t = typeof r.time === "string" ? r.time : "";
    const time = t === "form" && opt.withTime ? "form" : /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : "";
    const side = r.side === "buyer" || r.side === "seller" ? r.side : "both";
    return { id, on: r.on !== false, date, title, time, side, team: r.team !== false, client: r.client === true };
  });
}
