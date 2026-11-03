import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { runTrigger } from "@/server/automation";
import { dateFromIso, formatPhone, isoFromDate, normalizePhone, todayCentral } from "@/lib/normalize";
import { centralToUtc } from "@/lib/scheduledText";
import { formatTime, longIso } from "@/lib/tasks";
import { parseShowingEmail, type ShowingEmail } from "@/lib/showingTime";

// Showings on our listings from ShowingTime's emails (owner request 2026-11-01; SPEC.md §10 Showings). Called by the
// Gmail sync for every email from showingtime.com; anything that isn't about one of our listings is ignored.

const when = (s: { date: string; start: string; end: string | null }) => `${longIso(s.date)} ${formatTime(s.start)}${s.end ? `–${formatTime(s.end)}` : ""}`;

export async function onShowingEmail(gmailId: string, subject: string, text: string, received: Date): Promise<void> {
  const e = parseShowingEmail(subject, text, received);
  if (!e) return;
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, isOwner: true } });
  const ours = (n: string) => team.some((u) => u.name.toLowerCase() === n.trim().toLowerCase());
  // Our listing: "Presented by" one of us. A showing we booked for a buyer (owner request 2026-11-03): the listing
  // agent isn't one of us (one of our own listings is handled by its listing-side email).
  if (e.side === "listing" && e.presentedBy && !ours(e.presentedBy)) return;
  if (ours(e.agent.name) || team.some((u) => u.email.toLowerCase() === e.agent.email)) return;
  const owner = team.find((u) => u.isOwner) ?? team[0];
  if (!owner) return;
  if (e.kind === "confirmed") await confirmed(e, owner.id, gmailId);
  else await stopped(e, owner.id);
}

/** A new showing: the agent (found, or added), the showing, a note, and the "When a showing is confirmed" checklists. */
async function confirmed(e: ShowingEmail, ownerId: string, gmailId: string) {
  if (await db.showing.findUnique({ where: { key: e.key }, select: { id: true } })) return; // already read (the same email in two inboxes, or synced twice)
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
  await logActivity(ownerId, "create", "showing", r.agentId, `Showing from ShowingTime: ${e.agent.name} at ${e.address}, ${when(e)}${r.created ? " (agent added)" : ""}${r.tasks ? `, ${r.tasks} steps` : ""} [${gmailId.slice(0, 6)}]`);
}

/** Cancelled, or asked to move (the new time comes as its own confirmation): its texts are turned off. */
async function stopped(e: ShowingEmail, ownerId: string) {
  const at = e.kind === "rescheduled" ? e.was : { date: e.date, start: e.start };
  if (!at) return;
  const s = await db.showing.findFirst({ where: { status: "confirmed", side: e.side, date: dateFromIso(at.date), start: at.start, address: { equals: e.address, mode: "insensitive" } } });
  if (!s) return;
  const status = e.kind === "cancelled" ? "cancelled" : "rescheduled";
  await db.$transaction(async (tx) => {
    await tx.showing.update({ where: { id: s.id }, data: { status } });
    await tx.task.updateMany({ where: { showingId: s.id, completedAt: null, deletedAt: null, autoState: { in: ["pending", "failed"] } }, data: { autoState: "off" } });
    await tx.task.updateMany({ where: { showingId: s.id, completedAt: null, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.timelineEntry.create({ data: { personId: s.agentId, kind: "note", body: `Showing ${status} (ShowingTime): ${s.address}, ${when({ date: isoFromDate(s.date), start: s.start, end: s.end })}${status === "rescheduled" ? ". The new time starts again when it's confirmed." : ""}` } });
  });
  await logActivity(ownerId, "update", "showing", s.agentId, `Showing ${status}: ${s.address}, ${when({ date: isoFromDate(s.date), start: s.start, end: s.end })}`);
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
