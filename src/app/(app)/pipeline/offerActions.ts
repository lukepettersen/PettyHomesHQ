"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { extractOffer } from "@/server/offer";
import { applyTemplate, factsOf, loadTemplates, moveFile, runTrigger } from "@/server/automation";
import { findMentions } from "@/lib/mentions";
import { emailConnection, sendGmail } from "@/server/google";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { normalizeOffer, offerSummary, writtenStatementIncomplete } from "@/lib/offer";

// Submit offer (SPEC.md §7.5), ported from Relay.
const id = z.string().trim().min(1).max(40);

/** Claude organizes what was said, merged into the offer so far. Nothing is saved. */
export async function organizeOffer(input: { transcript: string; current: unknown }) {
  return guarded(null, async () => {
    const transcript = z.string().trim().min(1, "Say or type the offer terms first.").max(8000, "That's a lot at once. Try a shorter recording.").parse(input.transcript);
    return extractOffer(transcript, input.current ? normalizeOffer(input.current) : null, isoFromDate(todayCentral()));
  });
}

const submitSchema = z.object({ personId: id, fileId: id.nullable(), offer: z.unknown() });

/**
 * Saves the offer on the buyer deal (starting one if there's none), puts the offer note on the timeline
 * for the rest of the team (@mention), moves the deal to "Submitting offers", and starts every template
 * set to "When an offer is submitted" (each offer gets its own tasks).
 */
export async function submitOffer(input: z.input<typeof submitSchema>) {
  return guarded(null, async (user) => {
    const v = submitSchema.parse(input);
    const offer = normalizeOffer(v.offer);
    if (!offer.propertyAddress) throw new UserError("Say which property the offer is for.");
    if (offer.purchasePrice == null) throw new UserError("Say the purchase price.");
    if (writtenStatementIncomplete(offer)) throw new UserError("The written statement clause needs its date and who gets the earnest money before and after closing.");
    const person = await db.person.findFirst({ where: { id: v.personId, deletedAt: null }, select: { id: true, name: true } });
    if (!person) throw new UserError("That person was deleted.");

    const statuses = await db.pipelineStatus.findMany({ where: { kind: "buyer" }, orderBy: { position: "asc" } });
    const offerStatus = statuses.find((s) => /submitting offers?/i.test(s.name)) ?? null;
    const open = await db.clientFile.findMany({ where: { personId: person.id, kind: "buyer", deletedAt: null, closedAt: null }, include: { status: true }, orderBy: { createdAt: "desc" } });
    let file = v.fileId ? open.find((f) => f.id === v.fileId) : open.length === 1 ? open[0] : undefined;
    if (v.fileId && !file) throw new UserError("That buyer deal is closed or was deleted.");
    if (!file && open.length > 1) throw new UserError("Pick which buyer deal this offer is for.");

    const today = isoFromDate(todayCentral());
    let started = false;
    if (!file) {
      // No buyer deal yet: start one, tagged Buyer, at Submitting offers (or the first buyer status).
      const status = offerStatus ?? statuses[0];
      if (!status) throw new UserError("Add buyer statuses in Admin → Client statuses first.");
      const created = await db.$transaction(async (tx) => {
        const f = await tx.clientFile.create({ data: { personId: person.id, kind: "buyer", statusId: status.id, info: {}, createdById: user.id } });
        const tag = await tx.tag.upsert({ where: { name: "Buyer" }, update: {}, create: { name: "Buyer" } });
        await tx.personTag.upsert({ where: { personId_tagId: { personId: person.id, tagId: tag.id } }, update: {}, create: { personId: person.id, tagId: tag.id } });
        await runTrigger(tx, `status:${status.id}`, { personId: person.id, fileId: f.id, start: today, facts: {} }, user.id);
        return f;
      });
      file = { ...created, status };
      started = true;
      await logActivity(user.id, "create", "clientFile", created.id, `Started a buyer for ${person.name} at ${status.name} (offer submitted)`);
    }

    const summary = offerSummary(offer);
    const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true } });
    const others = team.filter((t) => t.id !== user.id);
    const body = `${summary}\n\n${others.map((t) => `@${t.name.split(/\s+/)[0]}`).join(" ")}`.trim();
    const mentioned = findMentions(body, others);
    const fin = offer.financingType === "fha" ? "FHA" : offer.financingType === "va" ? "VA" : offer.financingType ? "Other" : undefined;
    const offerTemplates = (await loadTemplates()).filter((t) => t.trigger === "offer");
    const fileId = file.id;

    const { offerId, tasks } = await db.$transaction(async (tx) => {
      const o = await tx.offer.create({ data: { fileId, personId: person.id, data: offer, summary, createdById: user.id } });
      await tx.timelineEntry.create({ data: { personId: person.id, kind: "note", body, authorId: user.id } });
      for (const m of mentioned) {
        await tx.notification.create({ data: { toId: m.id, fromId: user.id, personId: person.id, alert: true, text: `${user.name.split(" ")[0]} submitted an offer for ${person.name}: ${offer.propertyAddress} · $${offer.purchasePrice!.toLocaleString("en-US")}` } });
      }
      // Every offer gets its own set of offer tasks (unlike status templates, which run once per deal).
      let n = 0;
      for (const t of offerTemplates) n += await applyTemplate(tx, t, { personId: person.id, fileId, start: today, facts: { ...factsOf(file!.info), ...(fin ? { fin } : {}) } }, user.id);
      return { offerId: o.id, tasks: n };
    });

    // An existing deal before "Submitting offers" moves there (its status templates run as usual).
    let moved: string | null = null;
    if (!started && offerStatus && file.statusId !== offerStatus.id && (file.status?.position ?? -1) < offerStatus.position) {
      await moveFile(file.id, offerStatus.id, user.id);
      moved = offerStatus.name;
    }

    // Email the offer note to whoever was notified, from the connected Gmail, so it reaches their phone.
    // A failed email never undoes the offer; the bell and timeline already have it.
    const emailed: string[] = [];
    if (mentioned.length && (await emailConnection())) {
      const link = `${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/people/${person.id}`;
      const users = await db.user.findMany({ where: { id: { in: mentioned.map((m) => m.id) } }, select: { name: true, email: true } });
      for (const u of users) {
        const r = await sendGmail({ to: [u.email], subject: `Offer submitted: ${person.name} · ${offer.propertyAddress}`, body: `${user.name.split(" ")[0]} submitted an offer for ${person.name}.\n\nOpen in HQ: ${link}\n\n${summary}`, signature: false });
        if (r.ok) emailed.push(u.name.split(" ")[0]);
      }
    }
    await logActivity(user.id, "create", "offer", offerId, `Submitted an offer for ${person.name}: ${offer.propertyAddress}${tasks ? ` (${tasks} tasks)` : ""}`);
    revalidatePath(`/people/${person.id}`); revalidatePath("/pipeline"); revalidatePath("/tasks");
    return { fileId, started, moved, tasks, emailed, mentioned: mentioned.map((m) => m.name.split(" ")[0]) };
  });
}
