import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { sendGmail } from "@/server/google";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { cleanDigest, DEFAULT_DIGEST, digestEmail, digestRows, type DigestPa, type DigestSettings } from "@/lib/deadlineDigest";
import { KEY_DATES, type DateKey, type DateStatus } from "@/lib/pa";

// The weekly contingency deadlines email (owner request 2026-11-04). Settings in AppSetting "digest.deadlines";
// the day it last went out in "digest.deadlines.sent", so it goes once a week. Sent by the minute timer.
const KEY = "digest.deadlines", SENT = "digest.deadlines.sent";

export async function loadDigestSettings(): Promise<DigestSettings> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return row ? cleanDigest(row.value) : DEFAULT_DIGEST;
}
export async function saveDigestSettings(s: DigestSettings) {
  await db.appSetting.upsert({ where: { key: KEY }, update: { value: s }, create: { key: KEY, value: s } });
}

/** Every active contract's dates, for the email. */
async function activeContracts(): Promise<DigestPa[]> {
  const pas = await db.purchaseAgreement.findMany({ where: { state: "active", deletedAt: null, file: { deletedAt: null, person: { deletedAt: null } } }, include: { file: { include: { person: { select: { name: true } } } } } });
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
  return pas.map((p) => ({
    side: p.side === "seller" ? "seller" : "buyer", personName: p.file.person.name, address: p.address, writtenStatementNA: p.writtenStatementNA, hoa: obj(p.answers).hoa === "Yes",
    dates: Object.fromEntries(KEY_DATES.map(([k]) => [k, p[k] ? isoFromDate(p[k]!) : null])) as Record<DateKey, string | null>,
    dateStatus: obj(p.dateStatus) as Partial<Record<DateKey, DateStatus>>,
  }));
}

/** The email as it would go out today. */
export async function buildDigest(toFirst: string) {
  const today = isoFromDate(todayCentral());
  return digestEmail(digestRows(await activeContracts(), today), toFirst, today);
}

/** Sends it: to the saved recipients (or `to` for a test), from the saved teammate's Gmail (else the shared one). */
export async function sendDigest(s: DigestSettings, to?: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true, email: true, isOwner: true } });
  const recipients = to?.length ? to : s.to.length ? s.to : team.filter((u) => u.isOwner).map((u) => u.email);
  if (!recipients.length) return { ok: false, error: "Add who it goes to." };
  const sender = s.from ? team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === s.from.toLowerCase()) : undefined;
  const firstTo = team.find((u) => u.email.toLowerCase() === recipients[0].toLowerCase())?.name.split(/\s+/)[0] ?? "";
  const e = await buildDigest(firstTo);
  const r = await sendGmail({ to: recipients, subject: e.subject, body: e.body, signature: true, asUserId: sender?.id });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** The minute timer: once a week, on the chosen day at or after the chosen time (Central). Returns 1 when it sent. */
export async function sendDueDigest(now = new Date()): Promise<number> {
  const s = await loadDigestSettings();
  if (!s.on) return 0;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), hhmm = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  if (dow !== s.day || hhmm < s.time) return 0;
  const today = isoFromDate(todayCentral());
  // Claim today's send first, so two timer ticks can't both send it.
  const last = await db.appSetting.findUnique({ where: { key: SENT } });
  if (last?.value === today) return 0;
  const claimed = last ? await db.appSetting.updateMany({ where: { key: SENT, NOT: { value: { equals: today } } }, data: { value: today } }) : await db.appSetting.create({ data: { key: SENT, value: today } }).then(() => ({ count: 1 })).catch(() => ({ count: 0 }));
  if (!claimed.count) return 0;
  const r = await sendDigest(s);
  const owner = await db.user.findFirst({ where: { isOwner: true }, select: { id: true } });
  if (owner) await logActivity(owner.id, "create", "email", null, r.ok ? "Sent the weekly contingency deadlines email" : `Weekly contingency deadlines email didn't send: ${r.error}`);
  if (!r.ok && owner) await db.notification.create({ data: { toId: owner.id, alert: true, text: `The weekly contingency deadlines email wasn't sent: ${r.error}` } });
  return r.ok ? 1 : 0;
}
