import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { sendGmail } from "@/server/google";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { cleanDigest, closingsEmail, DEFAULT_DIGEST, digestEmail, digestRows, listingsEmail, REPORTS, type DigestPa, type DigestSettings, type ReportKind } from "@/lib/deadlineDigest";
import { KEY_DATES, type DateKey, type DateStatus } from "@/lib/pa";

// Weekly emails (owner requests 2026-11-04): contingency deadlines, closings and listings. Settings per report in
// AppSetting "digest.<kind>"; the day each last went out in "digest.<kind>.sent", so each goes once a week.
const key = (k: ReportKind) => `digest.${k}`, sentKey = (k: ReportKind) => `digest.${k}.sent`;

export async function loadDigestSettings(kind: ReportKind = "deadlines"): Promise<DigestSettings> {
  const row = await db.appSetting.findUnique({ where: { key: key(kind) } });
  return row ? cleanDigest(row.value) : DEFAULT_DIGEST;
}
export async function saveDigestSettings(s: DigestSettings, kind: ReportKind = "deadlines") {
  await db.appSetting.upsert({ where: { key: key(kind) }, update: { value: s }, create: { key: key(kind), value: s } });
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
export async function buildDigest(toFirst: string, kind: ReportKind = "deadlines") {
  const today = isoFromDate(todayCentral());
  if (kind === "closings") {
    const pas = await db.purchaseAgreement.findMany({ where: { deletedAt: null, OR: [{ state: "active" }, { state: "closed", endedOn: { gte: new Date(Date.now() - 10 * 86400000) } }], file: { deletedAt: null, person: { deletedAt: null } } }, include: { file: { include: { person: { select: { name: true } } } } } });
    return closingsEmail(pas.map((p) => ({ side: p.side === "seller" ? "seller" : "buyer", personName: p.file.person.name, address: p.address, closing: p.closing ? isoFromDate(p.closing) : null, closedOn: p.state === "closed" && p.endedOn ? isoFromDate(p.endedOn) : null })), toFirst, today);
  }
  if (kind === "listings") {
    const files = await db.clientFile.findMany({ where: { kind: "listing", deletedAt: null, closedAt: null, person: { deletedAt: null }, contracts: { none: { state: "active", deletedAt: null } } }, include: { status: { select: { name: true } }, person: { select: { name: true } } } });
    const info = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
    const iso = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
    return listingsEmail(files.map((f) => ({ personName: f.person.name, address: f.address, status: f.status?.name ?? "", active: iso(info(f.info).active), photos: iso(info(f.info).photos) })), toFirst, today);
  }
  return digestEmail(digestRows(await activeContracts(), today), toFirst, today);
}

/** Sends it: to the saved recipients (or `to` for a test), from the saved teammate's Gmail (else the shared one). */
export async function sendDigest(s: DigestSettings, to?: string[], kind: ReportKind = "deadlines"): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true, email: true, isOwner: true } });
  const recipients = to?.length ? to : s.to.length ? s.to : team.filter((u) => u.isOwner).map((u) => u.email);
  if (!recipients.length) return { ok: false, error: "Add who it goes to." };
  const sender = s.from ? team.find((u) => u.name.split(/\s+/)[0].toLowerCase() === s.from.toLowerCase()) : undefined;
  const firstTo = team.find((u) => u.email.toLowerCase() === recipients[0].toLowerCase())?.name.split(/\s+/)[0] ?? "";
  const e = await buildDigest(firstTo, kind);
  const r = await sendGmail({ to: recipients, subject: e.subject, body: e.body, signature: true, asUserId: sender?.id });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** The minute timer: each report once a week, on its day at or after its time (Central). Returns how many went out. */
export async function sendDueDigest(now = new Date()): Promise<number> {
  let n = 0;
  for (const r of REPORTS) n += await sendDueReport(r.kind, now);
  return n;
}

async function sendDueReport(kind: ReportKind, now: Date): Promise<number> {
  const s = await loadDigestSettings(kind);
  if (!s.on) return 0;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), hhmm = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  if (dow !== s.day || hhmm < s.time) return 0;
  const today = isoFromDate(todayCentral());
  // Claim today's send first, so two timer ticks can't both send it.
  const last = await db.appSetting.findUnique({ where: { key: sentKey(kind) } });
  if (last?.value === today) return 0;
  const claimed = last ? await db.appSetting.updateMany({ where: { key: sentKey(kind), NOT: { value: { equals: today } } }, data: { value: today } }) : await db.appSetting.create({ data: { key: sentKey(kind), value: today } }).then(() => ({ count: 1 })).catch(() => ({ count: 0 }));
  if (!claimed.count) return 0;
  const name = REPORTS.find((x) => x.kind === kind)!.name.toLowerCase();
  const r = await sendDigest(s, undefined, kind);
  const owner = await db.user.findFirst({ where: { isOwner: true }, select: { id: true } });
  if (owner) await logActivity(owner.id, "create", "email", null, r.ok ? `Sent the weekly ${name} email` : `Weekly ${name} email didn't send: ${r.error}`);
  if (!r.ok && owner) await db.notification.create({ data: { toId: owner.id, alert: true, text: `The weekly ${name} email wasn't sent: ${r.error}` } });
  return r.ok ? 1 : 0;
}
