import "server-only";
import { db } from "@/server/db";
import { seal, unseal } from "@/server/crypto";
import { isoFromDate } from "@/lib/normalize";
import { contractAppointments } from "@/lib/appointments";
import { apptEvent, contractKey, inviteeEmails, type GEvent } from "@/lib/calendar";
import { addressesIn, buildMime, messageText } from "@/lib/email";

// Google Calendar (SPEC.md §12). Off until configured: every call here quietly does nothing when Google
// isn't connected, and a Google error never stops HQ from saving.

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"; // emails on timelines, and the Gmail signature
export const hasScope = (c: { scopes: string } | null, scope: string) => !!c && c.scopes.split(/\s+/).includes(scope);
export const googleKeysSet = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
export const redirectUri = () => `${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/api/google/callback`;

export async function calendarConnection() {
  if (!googleKeysSet()) return null;
  const c = await db.googleConnection.findUnique({ where: { id: "calendar" } });
  // Google doesn't always say which account approved (Calendar events access can't read it): use the HQ user who connected.
  if (c && !c.email) c.email = (await db.user.findUnique({ where: { id: c.userId }, select: { email: true } }))?.email ?? "";
  return c;
}

/** Swaps the one-time code from Google's consent screen for a refresh token, and stores it encrypted. */
export async function connectWithCode(code: string, userId: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const tok = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!r.ok || !tok.refresh_token || !tok.access_token) throw new Error(tok.error ?? "Google didn't return a refresh token");
  // Which account approved: Gmail's profile when reading Gmail was allowed, else the connecting HQ user (filled in on read).
  const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tok.access_token}` } }).catch(() => null);
  const email = prof?.ok ? ((await prof.json()) as { emailAddress?: string }).emailAddress ?? "" : "";
  await db.googleConnection.upsert({ where: { id: "calendar" }, update: { userId, email, refreshToken: seal(tok.refresh_token), scopes: tok.scope ?? "" }, create: { id: "calendar", userId, email, refreshToken: seal(tok.refresh_token), scopes: tok.scope ?? "" } });
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
 * Written Statement deadlines, Close Date HOLD. Only the team and the client are invited, never partners
 * (lenders, title, the other agent): owner decision 2026-10-14.
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
      ];
      for (const a of contractAppointments(pa.file.person.name, { address: pa.address, inspAppt: answers.inspAppt, inspection: d(pa.inspection), writtenStatement: pa.writtenStatementNA ? null : d(pa.writtenStatement), closing: d(pa.closing) })) {
        wanted.set(contractKey(paId, a.title), apptEvent(a, emails, `${pa.address} · from the purchase agreement in Petty Homes HQ.`));
      }
    }
    for (const [key, ev] of wanted) await upsertEvent(key, ev);
    for (const key of existing) if (!wanted.has(key)) await deleteEvent(key);
  });
}

/** Gmail: the connected Google account may send email (it approved the Gmail send permission). */
export async function emailConnection() {
  const c = await calendarConnection();
  return hasScope(c, GMAIL_SEND_SCOPE) ? c : null;
}

async function gmail(path: string): Promise<Response | null> {
  const token = await accessToken().catch(() => null);
  if (!token) return null;
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

let sigCache: { html: string | null; until: number } | null = null;
/** The connected account's Gmail signature (HTML), added to emails sent from HQ. */
async function gmailSignature(email: string): Promise<string | null> {
  if (sigCache && sigCache.until > Date.now()) return sigCache.html;
  if (!hasScope(await calendarConnection(), GMAIL_READ_SCOPE)) return null;
  try {
    const r = await gmail("settings/sendAs");
    if (!r?.ok) return null;
    const list = ((await r.json()) as { sendAs?: { sendAsEmail: string; isPrimary?: boolean; signature?: string }[] }).sendAs ?? [];
    const html = (list.find((s) => s.sendAsEmail.toLowerCase() === email.toLowerCase()) ?? list.find((s) => s.isPrimary))?.signature || null;
    sigCache = { html, until: Date.now() + 10 * 60000 };
    return html;
  } catch { return null; }
}

/** Sends a plain-text email from the connected Gmail account. It lands in that account's Sent folder. */
export async function sendGmail(m: { to: string[]; subject: string; body: string; signature?: boolean }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const c = await emailConnection();
  if (!c) return { ok: false, error: "Gmail isn't connected. An Admin can reconnect Google in Admin → Integrations." };
  const token = await accessToken().catch(() => null);
  if (!token) return { ok: false, error: "Google didn't let HQ in. An Admin can reconnect Google in Admin → Integrations." };
  let raw: string;
  // "Luke Pettersen <luke@pettyhomes.com>": a real name as the sender looks less like a bulk mailer.
  const name = (await db.user.findUnique({ where: { id: c.userId }, select: { name: true } }))?.name?.replace(/["<>\r\n]/g, "").trim();
  const from = name ? (/^[\x20-\x7e]*$/.test(name) ? `"${name}" <${c.email}>` : `=?UTF-8?B?${Buffer.from(name).toString("base64")}?= <${c.email}>`) : c.email;
  try { raw = buildMime({ from, ...m, signatureHtml: m.signature === false ? null : await gmailSignature(c.email) }); } catch (e) { return { ok: false, error: (e as Error).message }; }
  try {
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
    });
    if (!r.ok) {
      return { ok: false, error: await gmailError(r, "send") };
    }
    return { ok: true, id: ((await r.json()) as { id?: string }).id ?? "" };
  } catch {
    return { ok: false, error: "Couldn't reach Gmail. Try again in a minute." };
  }
}

type GMsg = { id: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } & Parameters<typeof messageText>[0] };
const SYNC_EVERY = 3 * 60000, FIRST_LOOKBACK = 30 * 86400000;

/**
 * Emails to or from a person's saved addresses go on their timeline (SPEC.md §12). Runs at most every
 * 3 minutes for the team (whoever has HQ open triggers it); never fails loudly.
 */
export async function syncGmail(): Promise<number> {
  try {
    const c = await calendarConnection();
    if (!hasScope(c, GMAIL_READ_SCOPE)) return 0;
    const now = Date.now(), last = c!.gmailSyncedAt;
    if (last && now - last.getTime() < SYNC_EVERY) return 0;
    // Claim this run so two tabs don't sync at the same time.
    const claimed = await db.googleConnection.updateMany({ where: { id: "calendar", gmailSyncedAt: last }, data: { gmailSyncedAt: new Date(now) } });
    if (!claimed.count) return 0;
    try { return await syncSince(last ? last.getTime() - 10 * 60000 : now - FIRST_LOOKBACK, c!.email, c!.userId); }
    catch (e) { await db.googleConnection.update({ where: { id: "calendar" }, data: { gmailSyncedAt: last } }); throw e; }
  } catch (e) {
    console.error("Gmail: sync failed", e instanceof Error ? e.message : "unknown");
    return 0;
  }
}

async function syncSince(fromMs: number, accountEmail: string, accountUserId: string): Promise<number> {
  const ids: string[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const r = await gmail(`messages?maxResults=100&q=${encodeURIComponent(`after:${Math.floor(fromMs / 1000)} -in:chats -in:spam -in:trash`)}${page ? `&pageToken=${page}` : ""}`);
    if (!r) throw new Error("list: no token");
    if (!r.ok) throw new Error(`list: ${await gmailError(r, "sync")}`);
    const j = (await r.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(j.messages ?? []).map((m) => m.id));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  if (!ids.length) return 0;
  // Skip messages already on a timeline (sent from HQ, or synced before).
  const seen = new Set((await db.timelineEntry.findMany({ where: { OR: ids.map((id) => ({ gmailId: { startsWith: `${id}:` } })) }, select: { gmailId: true } })).map((e) => e.gmailId!.split(":")[0]));
  const team = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()).concat(accountEmail.toLowerCase()));
  let added = 0;
  for (const id of ids.filter((x) => !seen.has(x))) {
    const r = await gmail(`messages/${id}?format=full`);
    if (!r?.ok) continue;
    const m = (await r.json()) as GMsg;
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const from = addressesIn(h("from")), to = addressesIn(`${h("to")}, ${h("cc")}`);
    const outbound = from.some((a) => team.has(a));
    const theirs = [...from, ...to].filter((a) => !team.has(a));
    if (!theirs.length) continue;
    const matches = await db.email.findMany({ where: { normalized: { in: theirs }, person: { deletedAt: null } }, select: { personId: true, normalized: true } });
    const people = [...new Set(matches.map((x) => x.personId))];
    if (!people.length) continue;
    const at = new Date(Number(m.internalDate) || Date.now());
    const subject = h("subject").replace(/[\r\n]+/g, " ").slice(0, 300) || "(no subject)";
    const text = messageText(m.payload ?? {});
    for (const personId of people) {
      const mine = matches.filter((x) => x.personId === personId).map((x) => x.normalized);
      const line = outbound ? `To ${to.filter((a) => mine.includes(a)).join(", ") || mine[0]}` : `From ${from[0]}`;
      try {
        await db.timelineEntry.create({ data: { personId, kind: "email", gmailId: `${id}:${personId}`, body: `${line} · ${subject}\n\n${text}`, createdAt: at, authorId: outbound ? accountUserId : null } });
        await db.person.updateMany({ where: { id: personId, OR: [{ lastContactAt: null }, { lastContactAt: { lt: at } }] }, data: { lastContactAt: at } });
        added++;
      } catch { /* already added by another run */ }
    }
  }
  return added;
}

/** Google's reason for saying no, in plain words. Logged without any message content. */
async function gmailError(r: Response, what: string): Promise<string> {
  let reason = "", message = "";
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
    reason = j.error?.errors?.[0]?.reason ?? j.error?.details?.find((d) => d.reason)?.reason ?? j.error?.status ?? "";
    message = (j.error?.message ?? "").slice(0, 300);
  } catch { /* not JSON */ }
  console.error(`Gmail: ${what} failed`, r.status, reason, message);
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|is disabled/i.test(message))
    return "The Gmail API is off in Google Cloud (or was just turned on: give it 5 minutes). Turn it on in the same Google Cloud project as the HQ sign-in, then try again.";
  if (/insufficient|SCOPE/i.test(reason + message))
    return "Google didn't give HQ permission to send. In Admin → Integrations click Reconnect Google, and leave every box ticked on Google's screen.";
  if (r.status === 401) return "Google signed HQ out. An Admin can click Reconnect Google in Admin → Integrations.";
  if (r.status === 429) return "Gmail's sending limit was reached. Try again later.";
  return `Gmail didn't send it (${r.status}${message ? `: ${message}` : ""}). Try again in a minute.`;
}
