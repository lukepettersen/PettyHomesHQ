import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { runTrigger } from "@/server/automation";
import { alertIfWanted } from "@/server/sounds";
import { dateFromIso, formatPhone, isoFromDate, normalizePhone, todayCentral } from "@/lib/normalize";
import { centralToUtc } from "@/lib/scheduledText";
import { formatTime, longIso } from "@/lib/tasks";
import { parseShowingEmail, showingReadProblem, streetKey, type ShowingEmail } from "@/lib/showingTime";

// Showings on our listings from ShowingTime's emails (owner request 2026-11-01; SPEC.md §10 Showings). Called by the
// Gmail sync for every email from showingtime.com; anything that isn't about one of our listings is ignored.

// Showing emails log (owner request 2026-11-23: "somewhere I can track this feature"): every ShowingTime email HQ
// reads and what it did with it, newest first, the last 80. Subject and outcome only, never the email itself.
export type ShowingLogRow = { at: string; received: string; subject: string; result: "added" | "updated" | "skipped" | "failed"; why: string; personId?: string | null; inbox?: string };
const LOG_KEY = "showings.log";
export async function logShowingEmail(row: Omit<ShowingLogRow, "at">) {
  try {
    const cur = await db.appSetting.findUnique({ where: { key: LOG_KEY } });
    const list = (Array.isArray(cur?.value) ? cur.value : []) as ShowingLogRow[];
    if (list.some((x) => x.subject === row.subject.slice(0, 160) && x.received === row.received && x.result === row.result && x.why === row.why.slice(0, 240))) return; // read again, same outcome: no new row
    const value = [{ at: new Date().toISOString(), ...row, subject: row.subject.slice(0, 160), why: row.why.slice(0, 240) }, ...list].slice(0, 80);
    await db.appSetting.upsert({ where: { key: LOG_KEY }, update: { value }, create: { key: LOG_KEY, value } });
  } catch { /* the log never stops a showing */ }
}
export async function loadShowingLog(): Promise<ShowingLogRow[]> {
  const cur = await db.appSetting.findUnique({ where: { key: LOG_KEY } });
  return (Array.isArray(cur?.value) ? cur.value : []) as ShowingLogRow[];
}

const when = (s: { date: string; start: string; end: string | null }) => `${longIso(s.date)} ${formatTime(s.start)}${s.end ? `–${formatTime(s.end)}` : ""}`;

export async function onShowingEmail(gmailId: string, subject: string, text: string, received: Date, inbox = ""): Promise<void> {
  const base = { received: received.toISOString(), subject, inbox };
  const skip = (why: string) => logShowingEmail({ ...base, result: "skipped", why });
  const e = parseShowingEmail(subject, text, received);
  if (!e) {
    // A confirmation / cancellation HQ should have read but couldn't (owner report 2026-11-23): say so, loudly.
    if (/(?:^|\| |^YOUR |\d(?:ST|ND|RD|TH) )SHOWING (?:CONFIRMED|CANCELL?ED|RESCHEDULED) \||^(?:CONFIRMED|CANCELL?ED|RESCHEDULED) \|/i.test(subject.trim())) {
      await logShowingEmail({ ...base, result: "failed", why: `A showing email HQ couldn't read (the agent's name or the time wasn't where HQ looks). Tell Claude so it can be fixed. ${showingReadProblem(subject, text)}` });
      const owner = await db.user.findFirst({ where: { isOwner: true }, select: { id: true } });
      if (owner) await db.notification.create({ data: { toId: owner.id, alert: true, link: "/admin/showings", text: `HQ couldn't read a ShowingTime email ("${subject.slice(0, 90)}"). See Admin → Showing emails.` } }).catch(() => null);
      return;
    }
    return skip("Not a showing confirmation, cancellation or reschedule (e.g. a request, reminder or feedback email).");
  }
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, isOwner: true } });
  const ours = (n: string) => team.some((u) => u.name.toLowerCase() === n.trim().toLowerCase());
  // Our listing: "Presented by" one of us. A showing we booked for a buyer (owner request 2026-11-03): the listing
  // agent isn't one of us (one of our own listings is handled by its listing-side email).
  if (e.side === "listing" && e.presentedBy && !ours(e.presentedBy)) return skip(`Not our listing ("Presented by ${e.presentedBy}").`);
  if (ours(e.agent.name) || team.some((u) => u.email.toLowerCase() === e.agent.email)) return skip(`The showing agent is on our team (${e.agent.name}).`);
  const owner = team.find((u) => u.isOwner) ?? team[0];
  if (!owner) return skip("No owner in HQ.");
  if (e.kind === "confirmed") {
    const r = await confirmed(e, owner.id, gmailId);
    await logShowingEmail({ ...base, result: r.added ? "added" : "skipped", why: r.why, personId: r.personId });
  } else {
    const r = await stopped(e, owner.id);
    await logShowingEmail({ ...base, result: r.personId ? "updated" : "skipped", why: r.why, personId: r.personId });
  }
}

/** A new showing: the agent (found, or added), the showing, a note, and the "When a showing is confirmed" checklists. */
async function confirmed(e: ShowingEmail, ownerId: string, gmailId: string) {
  // Already in HQ: the same key, or the same place and time on the same side (owner report 2026-11-23: a re-read gave the
  // same showing a second key, so it was saved twice and its texts went out twice).
  const sameTime = await db.showing.findMany({ where: { date: dateFromIso(e.date), start: e.start, side: e.side }, select: { agentId: true, address: true } });
  const k = streetKey(e.address)?.toLowerCase();
  const had = (await db.showing.findUnique({ where: { key: e.key }, select: { agentId: true } }))
    ?? sameTime.find((x) => x.address.toLowerCase() === e.address.toLowerCase() || (!!k && streetKey(x.address)?.toLowerCase() === k)) ?? null;
  if (had) return { added: false, why: "Already in HQ (the same email in two inboxes, or read twice).", personId: had.agentId }; // already read
  const mobile = normalizePhone(e.agent.mobile), office = normalizePhone(e.agent.office);
  const phones = [mobile, office].filter((n) => n.length === 10);
  const existing = e.agent.email || phones.length ? await db.person.findFirst({ where: { deletedAt: null, OR: [
    ...(e.agent.email ? [{ emails: { some: { normalized: e.agent.email } } }] : []), ...(mobile.length === 10 ? [{ phones: { some: { normalized: mobile } } }] : []),
  ] }, select: { id: true, name: true } }) : null;
  const sellerPhone = normalizePhone(e.seller?.phone ?? "");
  const seller = e.seller && (e.seller.email || sellerPhone.length === 10) ? await db.person.findFirst({ where: { deletedAt: null, OR: [
    ...(e.seller.email ? [{ emails: { some: { normalized: e.seller.email } } }] : []), ...(sellerPhone.length === 10 ? [{ phones: { some: { normalized: sellerPhone } } }] : []),
  ] }, select: { id: true } }) : null;
  const future = centralToUtc(e.date, e.start).getTime() > Date.now();

  const r = await db.$transaction(async (tx) => {
    let agentId = existing?.id;
    if (!agentId) {
      const stage = await tx.stage.findFirst({ where: { name: { contains: "partner", mode: "insensitive" } }, select: { id: true } });
      const p = await tx.person.create({ data: {
        name: e.agent.name, mailingName: e.agent.name, company: e.agent.company || null, partnerType: "realtor", stageId: stage?.id ?? null, createdById: ownerId,
        phones: phones.length ? { create: [mobile, office].map((n, i) => ({ n, i })).filter((x) => x.n.length === 10).map((x, position) => ({ label: x.i === 0 ? "Mobile" : "Office", number: formatPhone(x.n), normalized: x.n, position })) } : undefined,
        emails: e.agent.email ? { create: [{ label: "", address: e.agent.email, normalized: e.agent.email, position: 0 }] } : undefined,
      } });
      agentId = p.id;
    }
    const s = await tx.showing.create({ data: { key: e.key, agentId, sellerId: seller?.id ?? null, address: e.address, mlsId: e.mlsId, date: dateFromIso(e.date), start: e.start, end: e.end, total: e.total, side: e.side, noTexts: e.noTexts } });
    await tx.timelineEntry.create({ data: { personId: agentId, kind: "note", body: e.side === "buyer"
      ? `We're showing their listing (ShowingTime): ${e.address}, ${when(e)}${e.noTexts ? ". Their listing says no text messages." : ""}`
      : `Showing booked (ShowingTime): ${e.address}, ${when(e)}` } });
    // Only for showings still ahead, so nothing old sends by surprise.
    const tasks = future ? await runTrigger(tx, e.side === "buyer" ? "showing:booked" : "showing:confirmed", { personId: agentId, showingId: s.id, start: isoFromDate(todayCentral()),
      dates: { showing: e.date, showingEnd: e.date }, times: { showing: e.start, showingEnd: e.end ?? e.start } }, ownerId) : 0;
    // "No text messages" on the listing: its automatic texts don't send; each stays a task to reach them another way.
    if (e.noTexts && tasks) await tx.task.updateMany({ where: { showingId: s.id, kind: "text", autoState: "pending" }, data: { autoState: "off", autoError: "Their listing says no text messages, so it wasn't texted. Email or call them instead." } });
    return { agentId, showingId: s.id, created: !existing, tasks };
  });
  // Only showings still ahead (an old email read again doesn't alert).
  if (future) {
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true } });
    await alertIfWanted("newShowing", team.map((u) => u.id), { personId: r.agentId, text: e.side === "buyer"
      ? `Showing booked: ${e.address}, ${when(e)} (listing agent ${e.agent.name})`
      : `New showing: ${e.agent.name} at ${e.address}, ${when(e)}` });
  }
  await logActivity(ownerId, "create", "showing", r.agentId, `Showing from ShowingTime: ${e.agent.name} at ${e.address}, ${when(e)}${r.created ? " (agent added)" : ""}${r.tasks ? `, ${r.tasks} steps` : ""} [${gmailId.slice(0, 6)}]`);
  return { added: true, personId: r.agentId, why: `${e.side === "buyer" ? "Showing we booked" : "Showing on our listing"}: ${e.agent.name} at ${e.address}, ${when(e)}${r.created ? " (agent added as a contact)" : ""}. ${future ? (r.tasks ? `${r.tasks} checklist steps started.` : "No checklist applies (Checklists → \"When a showing is confirmed\").") : "Already past when HQ read it, so no checklist texts."}` };
}

/** Cancelled, or asked to move (the new time comes as its own confirmation): its texts are turned off. */
async function stopped(e: ShowingEmail, ownerId: string) {
  const at = e.kind === "rescheduled" ? e.was : { date: e.date, start: e.start };
  if (!at) return { personId: null, why: "No earlier time in the email to match." };
  // The same place and time, on either side: matched by house number and street, since offices write the address
  // differently ("Unit# #212", "Road" / "Rd") (owner report 2026-11-13).
  const key = streetKey(e.address)?.toLowerCase();
  const same = await db.showing.findMany({ where: { status: "confirmed", date: dateFromIso(at.date), start: at.start } });
  const s = same.find((x) => x.address.toLowerCase() === e.address.toLowerCase()) ?? (key ? same.find((x) => streetKey(x.address)?.toLowerCase() === key) : undefined);
  if (!s) return { personId: null, why: `No matching showing in HQ to ${e.kind === "cancelled" ? "cancel" : "move"} (${e.address}).` };
  const status = e.kind === "cancelled" ? "cancelled" : "rescheduled";
  await db.$transaction(async (tx) => {
    await tx.showing.update({ where: { id: s.id }, data: { status } });
    await tx.task.updateMany({ where: { showingId: s.id, completedAt: null, deletedAt: null, autoState: { in: ["pending", "failed"] } }, data: { autoState: "off" } });
    await tx.task.updateMany({ where: { showingId: s.id, completedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.timelineEntry.create({ data: { personId: s.agentId, kind: "note", body: `Showing ${status} (ShowingTime): ${s.address}, ${when({ date: isoFromDate(s.date), start: s.start, end: s.end })}${status === "rescheduled" ? ". The new time starts again when it's confirmed." : ""}` } });
  });
  await logActivity(ownerId, "update", "showing", s.agentId, `Showing ${status}: ${s.address}, ${when({ date: isoFromDate(s.date), start: s.start, end: s.end })}`);
  return { personId: s.agentId, why: `Showing ${status}: ${s.address}; its texts were turned off.` };
}

/** A contact's showings (as the buyer's agent on our listing, or the listing agent on one we showed), newest first, for the Showings card. */
export async function loadShowings(agentId: string) {
  const rows = await db.showing.findMany({ where: { agentId }, orderBy: [{ date: "desc" }, { start: "desc" }], take: 30, include: { seller: { select: { id: true, name: true, deletedAt: true } } } });
  const today = isoFromDate(todayCentral());
  return rows.map((s) => {
    const date = isoFromDate(s.date);
    return { id: s.id, side: s.side, address: s.address, date, when: when({ date, start: s.start, end: s.end }), status: s.status === "confirmed" && date < today ? "shown" : s.status,
      seller: s.seller && !s.seller.deletedAt ? { id: s.seller.id, name: s.seller.name } : null, total: s.total };
  });
}

/** Once (owner report 2026-11-23): a showing saved twice keeps the first; the copy's unsent texts and open steps are
 *  removed and the copy is deleted. Run from the minute timer; AppSetting flag `showings.dedupe.2026-11-23`. */
export async function dedupeShowingsOnce(): Promise<number> {
  const flag = "showings.dedupe.2026-11-23";
  if (await db.appSetting.findUnique({ where: { key: flag } })) return 0;
  if (!(await db.appSetting.create({ data: { key: flag, value: new Date().toISOString() } }).then(() => true, () => false))) return 0;
  const rows = await db.showing.findMany({ where: { status: "confirmed", date: { gte: new Date(Date.now() - 14 * 86400000) } }, orderBy: { createdAt: "asc" } });
  const seen = new Map<string, string>();
  let n = 0;
  for (const r of rows) {
    const k = `${r.side}|${isoFromDate(r.date)}|${r.start}|${streetKey(r.address)?.toLowerCase() ?? r.address.toLowerCase()}`;
    if (!seen.has(k)) { seen.set(k, r.id); continue; }
    await db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { showingId: r.id, completedAt: null, deletedAt: null, autoState: { in: ["pending", "failed"] } }, data: { autoState: "off" } });
      await tx.task.updateMany({ where: { showingId: r.id, completedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.showing.delete({ where: { id: r.id } });
    });
    n++;
  }
  if (n) {
    const owner = await db.user.findFirst({ where: { isOwner: true }, select: { id: true } });
    if (owner) await logActivity(owner.id, "update", "showing", null, `Removed ${n} showing${n === 1 ? "" : "s"} saved twice (and their unsent texts)`);
  }
  return n;
}
