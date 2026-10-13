import "server-only";
import { db } from "@/server/db";
import { seal, unseal } from "@/server/crypto";
import { isoFromDate } from "@/lib/normalize";
import { contractAppointments } from "@/lib/appointments";
import { apptEvent, contractKey, inviteeEmails, type GEvent } from "@/lib/calendar";

// Google Calendar (SPEC.md §12). Off until configured: every call here quietly does nothing when Google
// isn't connected, and a Google error never stops HQ from saving.

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const googleKeysSet = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
export const redirectUri = () => `${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/api/google/callback`;

export async function calendarConnection() {
  if (!googleKeysSet()) return null;
  return db.googleConnection.findUnique({ where: { id: "calendar" } });
}

/** Swaps the one-time code from Google's consent screen for a refresh token, and stores it encrypted. */
export async function connectWithCode(code: string, userId: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const tok = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !tok.refresh_token || !tok.access_token) throw new Error(tok.error ?? "Google didn't return a refresh token");
  const cal = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const email = cal.ok ? ((await cal.json()) as { id?: string }).id ?? "" : "";
  await db.googleConnection.upsert({ where: { id: "calendar" }, update: { userId, email, refreshToken: seal(tok.refresh_token) }, create: { id: "calendar", userId, email, refreshToken: seal(tok.refresh_token) } });
  cached = { token: tok.access_token, until: Date.now() + (tok.expires_in ?? 3000) * 1000 - 60000 };
  return email;
}

export async function disconnect() {
  const c = await db.googleConnection.findUnique({ where: { id: "calendar" } });
  if (!c) return;
  try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(unseal(c.refreshToken))}`, { method: "POST" }); } catch { /* already revoked */ }
  await db.googleConnection.delete({ where: { id: "calendar" } });
  cached = null;
}

let cached: { token: string; until: number } | null = null;
async function accessToken(): Promise<string | null> {
  if (cached && cached.until > Date.now()) return cached.token;
  const c = await calendarConnection();
  if (!c) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: unseal(c.refreshToken), client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token" }),
  });
  const tok = await r.json() as { access_token?: string; expires_in?: number };
  if (!r.ok || !tok.access_token) { console.error("Google Calendar: token refresh failed", r.status); return null; }
  cached = { token: tok.access_token, until: Date.now() + (tok.expires_in ?? 3000) * 1000 - 60000 };
  return cached.token;
}

async function call(method: string, path: string, body?: unknown): Promise<Response | null> {
  const token = await accessToken();
  if (!token) return null;
  return fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
}

/** Creates or updates the event for an HQ item; invites go out to attendees. */
async function upsertEvent(key: string, ev: GEvent) {
  const link = await db.calendarLink.findUnique({ where: { key } });
  if (link) {
    const r = await call("PATCH", `/${encodeURIComponent(link.eventId)}?sendUpdates=all`, ev);
    if (r?.ok) return;
    if (r && r.status !== 404 && r.status !== 410) { console.error("Google Calendar: update failed", r.status); return; }
  }
  const r = await call("POST", "?sendUpdates=all", ev);
  if (!r) return;
  if (!r.ok) { console.error("Google Calendar: create failed", r.status); return; }
  const { id } = (await r.json()) as { id: string };
  await db.calendarLink.upsert({ where: { key }, update: { eventId: id }, create: { key, eventId: id } });
}

async function deleteEvent(key: string) {
  const link = await db.calendarLink.findUnique({ where: { key } });
  if (!link) return;
  const r = await call("DELETE", `/${encodeURIComponent(link.eventId)}?sendUpdates=all`);
  if (r && !r.ok && r.status !== 404 && r.status !== 410) { console.error("Google Calendar: delete failed", r.status); return; }
  if (r) await db.calendarLink.delete({ where: { key } });
}

const safely = async (what: string, fn: () => Promise<void>) => {
  try { if (await calendarConnection()) await fn(); } catch (e) { console.error(`Google Calendar: ${what} failed`, e instanceof Error ? e.message : "unknown"); }
};
const team = () => db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { name: true, email: true } });

/** Puts an appointment on the calendar (or removes it if it was deleted). */
export function syncAppointment(id: string) {
  return safely("appointment sync", async () => {
    const a = await db.appointment.findUnique({ where: { id }, include: { person: { include: { emails: { orderBy: { position: "asc" } } } } } });
    if (!a || a.deletedAt || a.person.deletedAt) { await deleteEvent(`appt:${id}`); return; }
    const invitees = Array.isArray(a.invitees) ? (a.invitees as string[]) : [];
    const people = inviteeEmails(invitees, await team(), { firstName: a.person.name.split("&")[0].trim(), email: a.person.emails[0]?.address ?? null });
    await upsertEvent(`appt:${id}`, apptEvent({ title: a.title, date: isoFromDate(a.date), start: a.start, end: a.end, location: a.location }, people, "Booked in Petty Homes HQ."));
  });
}

/**
 * Contract dates on the calendar while the contract is active: inspection appointment, inspection and
 * Written Statement deadlines, Close Date HOLD. Everyone on the contract is invited: the team, the
 * client's emails and every email in the contract's people sections.
 */
export function syncContract(paId: string) {
  return safely("contract sync", async () => {
    const pa = await db.purchaseAgreement.findUnique({ where: { id: paId }, include: { file: { include: { person: { include: { emails: true } } } } } });
    const prefix = `pa:${paId}:`;
    const existing = (await db.calendarLink.findMany({ where: { key: { startsWith: prefix } } })).map((l) => l.key);
    const active = pa && pa.state === "active" && !pa.deletedAt && !pa.file.deletedAt && !pa.file.person.deletedAt;
    const wanted = new Map<string, GEvent>();
    if (active) {
      const answers = (pa.answers && typeof pa.answers === "object" ? pa.answers : {}) as Record<string, string>;
      const d = (x: Date | null) => (x ? isoFromDate(x) : null);
      const emails = [
        ...(await team()).map((t) => ({ email: t.email, name: t.name })),
        ...pa.file.person.emails.map((e) => ({ email: e.address, name: pa.file.person.name })),
        ...Object.values(answers).filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())).map((v) => ({ email: v.trim(), name: v.trim() })),
      ];
      for (const a of contractAppointments(pa.file.person.name, { address: pa.address, inspAppt: answers.inspAppt, inspection: d(pa.inspection), writtenStatement: pa.writtenStatementNA ? null : d(pa.writtenStatement), closing: d(pa.closing) })) {
        wanted.set(contractKey(paId, a.title), apptEvent(a, emails, `${pa.address} · from the purchase agreement in Petty Homes HQ.`));
      }
    }
    for (const [key, ev] of wanted) await upsertEvent(key, ev);
    for (const key of existing) if (!wanted.has(key)) await deleteEvent(key);
  });
}
