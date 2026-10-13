// Google Calendar events built from HQ appointments and contract dates (SPEC.md §10, §12).
// Pure, unit tested in calendar.test.ts.
import { addMinutes, type ApptView } from "./appointments";

export const TZ = "America/Chicago";
export type GEvent = {
  summary: string; location?: string; description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email: string; displayName?: string }[];
};

const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** An appointment as a Google event: timed in Central time, or all-day when there's no start time. */
export function apptEvent(a: Pick<ApptView, "title" | "date" | "start" | "end" | "location">, attendees: { email: string; name: string }[] = [], description?: string): GEvent {
  const ev: GEvent = a.start
    ? { summary: a.title, start: { dateTime: `${a.date}T${a.start}:00`, timeZone: TZ }, end: { dateTime: `${a.date}T${a.end && a.end > a.start ? a.end : addMinutes(a.start, 60)}:00`, timeZone: TZ } }
    : { summary: a.title, start: { date: a.date }, end: { date: nextDay(a.date) } };
  if (a.location) ev.location = a.location;
  if (description) ev.description = description;
  const unique = attendees.filter((x, i, all) => x.email && all.findIndex((y) => y.email.toLowerCase() === x.email.toLowerCase()) === i);
  if (unique.length) ev.attendees = unique.map((x) => ({ email: x.email, displayName: x.name }));
  return ev;
}

/** Invitee names (as ticked when booking) → email addresses: the team's, and the client's first email. */
export function inviteeEmails(invitees: string[], team: { name: string; email: string }[], client: { firstName: string; email: string | null }): { email: string; name: string }[] {
  return invitees.flatMap((n) => {
    const member = team.find((t) => t.name === n);
    if (member) return [{ email: member.email, name: member.name }];
    if (client.email && n === client.firstName) return [{ email: client.email, name: n }];
    return [];
  });
}

/** Stable keys for contract-date events, so they're updated instead of duplicated. */
export const contractKey = (paId: string, title: string) => `pa:${paId}:${title.split(" - ").slice(1).join(" - ").toLowerCase().replace(/[^a-z]+/g, "-")}`;
