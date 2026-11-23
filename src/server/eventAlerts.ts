import "server-only";
import { db } from "@/server/db";
import { sendGmail } from "@/server/google";
import { logActivity } from "@/server/activity";
import { publicBase } from "@/server/twilio";
import { cleanOpenAlert, openAlertDue, openAlertEmail, openGames, type OpenAlert } from "@/lib/events";
import { isoFromDate, todayCentral } from "@/lib/normalize";

// Open-game emails (SPEC.md §6.7; owner request 2026-11-23): email chosen teammates when a game coming up has nobody
// confirmed or sent. Settings per event in AppSetting `events.openAlert.<eventId>`, last send in `….sent`.
const key = (eventId: string) => `events.openAlert.${eventId}`;
const sentKey = (eventId: string) => `events.openAlert.${eventId}.sent`;

export async function loadOpenAlert(eventId: string): Promise<OpenAlert> {
  const row = await db.appSetting.findUnique({ where: { key: key(eventId) } });
  return cleanOpenAlert(row?.value ?? null);
}

export async function saveOpenAlert(userId: string, eventId: string, input: unknown): Promise<OpenAlert> {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, name: true } });
  if (!e) throw new Error("That event is gone.");
  const team = new Set((await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true } })).map((u) => u.id));
  const v = cleanOpenAlert(input);
  v.to = v.to.filter((id) => team.has(id));
  await db.appSetting.upsert({ where: { key: key(eventId) }, update: { value: v }, create: { key: key(eventId), value: v } });
  await logActivity(userId, "update", "event", null, `${v.on ? "Turned on" : "Turned off"} open-game emails for ${e.name}`);
  return v;
}

/** Builds and sends the email now. `test`: sends even with no open games (says so), to show what it looks like. */
export async function sendOpenAlert(eventId: string, a: OpenAlert, test = false): Promise<{ ok: true; games: number } | { ok: false; error: string }> {
  const e = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { slots: true, attendees: { include: { person: { select: { name: true } } } } } });
  if (!e) return { ok: false, error: "That event is gone." };
  const to = (await db.user.findMany({ where: { id: { in: a.to }, status: { not: "DISABLED" } }, select: { email: true } })).map((u) => u.email);
  if (!to.length) return { ok: false, error: "Pick who it goes to." };
  const today = isoFromDate(todayCentral());
  const slots = e.slots.map((s) => ({ id: s.id, date: isoFromDate(s.date), time: s.time, title: s.title, opponent: s.opponent, details: s.details }));
  const games = openGames(slots, e.attendees.map((x) => ({ slotId: x.slotId, status: x.status, name: x.person.name })), today, a.days);
  if (!games.length && !test) return { ok: true, games: 0 };
  const link = `${publicBase()}/events/${e.id}`;
  const m = games.length ? openAlertEmail(e.name, games, a.days, link)
    : { subject: `${e.name}: every game in the next ${a.days} days has someone (test)`, body: `Nothing to do: every game in the next ${a.days} days has someone confirmed or sent.\n\nOpen the event in HQ: ${link}\n\n— HQ open-game reminder` };
  const owner = await db.user.findFirst({ where: { isOwner: true }, select: { id: true } });
  const r = await sendGmail({ to, subject: test && games.length ? `${m.subject} (test)` : m.subject, body: m.body, signature: false, asUserId: owner?.id });
  return r.ok ? { ok: true, games: games.length } : { ok: false, error: r.error };
}

/** The minute timer: each event's open-game email on its day and time, once a day at most. Returns emails sent. */
export async function sendDueOpenAlerts(now = new Date()): Promise<number> {
  const rows = await db.appSetting.findMany({ where: { key: { startsWith: "events.openAlert.", not: { endsWith: ".sent" } } } });
  if (!rows.length) return 0;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const clock = { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hhmm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, today: isoFromDate(todayCentral(now)) };
  let n = 0;
  for (const row of rows) {
    const eventId = row.key.slice("events.openAlert.".length);
    const a = cleanOpenAlert(row.value);
    const last = await db.appSetting.findUnique({ where: { key: sentKey(eventId) } });
    if (!openAlertDue(a, clock, typeof last?.value === "string" ? last.value : null)) continue;
    // Claim today's check first, so two timer ticks can't both send it.
    const claimed = last ? await db.appSetting.updateMany({ where: { key: sentKey(eventId), NOT: { value: { equals: clock.today } } }, data: { value: clock.today } })
      : await db.appSetting.create({ data: { key: sentKey(eventId), value: clock.today } }).then(() => ({ count: 1 }), () => ({ count: 0 }));
    if (!claimed.count) continue;
    const r = await sendOpenAlert(eventId, a);
    if (r.ok && r.games) n++;
    if (!r.ok) {
      const owner = await db.user.findFirst({ where: { isOwner: true }, select: { id: true } });
      if (owner) await db.notification.create({ data: { toId: owner.id, alert: true, link: `/events/${eventId}`, text: `The open-game email didn't send: ${r.error}` } });
    }
  }
  return n;
}
