"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { fubHistoryFor, fubKeySet, fubTemplates } from "@/server/fub";
import { callEntry, convertMergeFields, folderOf, htmlToMarkup, noteEntry, textEntry, type HistoryEntry } from "@/lib/fubHistory";

// Admin → Import from Follow Up Boss → templates and history (SPEC.md §15). Admins only; read only in FUB.

type TemplateRow = { key: string; kind: "email" | "text"; name: string; folder: string; subject: string; body: string; unknown: string[]; skip: string | null };

async function templateRows(): Promise<TemplateRow[]> {
  if (!fubKeySet()) throw new UserError("Add FUB_API_KEY in Railway first.");
  const t = await fubTemplates().catch((e: Error) => { throw new UserError(e.message); });
  const existing = await db.messageTemplate.findMany({ select: { kind: true, name: true, fubKey: true } });
  const have = new Set(existing.map((x) => `${x.kind}:${x.name.toLowerCase()}`)), imported = new Set(existing.map((x) => x.fubKey).filter(Boolean));
  const rows: TemplateRow[] = [];
  const add = (kind: "email" | "text", id: string, name: string, subject: string, rawBody: string) => {
    if (!name) return;
    const body = convertMergeFields(kind === "email" ? htmlToMarkup(rawBody) : rawBody.trim()), subj = convertMergeFields(subject);
    const key = `${kind}:${id}`;
    const skip = imported.has(key) ? "Already copied" : have.has(`${kind}:${name.toLowerCase()}`) ? "Same name already in HQ" : null;
    rows.push({ key, kind, name: name.slice(0, 200), folder: folderOf(name), subject: subj.text.slice(0, 300), body: body.text.slice(0, 20000), unknown: [...new Set([...subj.unknown, ...body.unknown])], skip });
    have.add(`${kind}:${name.toLowerCase()}`); // a repeated FUB name is copied once
  };
  for (const e of t.emails) add("email", e.id, e.name, e.subject, e.body);
  for (const x of t.texts) add("text", x.id, x.name, "", x.body);
  return rows;
}

export async function previewTemplates() {
  return guarded("manageUsers", async () => {
    const rows = await templateRows();
    return { rows: rows.map(({ body: _b, ...r }) => ({ ...r, preview: _b.slice(0, 160) })) };
  });
}

export async function importTemplates() {
  return guarded("manageUsers", async (user) => {
    const rows = (await templateRows()).filter((r) => !r.skip);
    if (rows.length) await db.messageTemplate.createMany({ data: rows.map((r) => ({ kind: r.kind, name: r.name, folder: r.folder, subject: r.subject, body: r.body, fubKey: r.key })), skipDuplicates: true });
    await logActivity(user.id, "create", "import", "fub-templates", `Copied ${rows.length} templates from Follow Up Boss`);
    revalidatePath("/admin/text-templates"); revalidatePath("/admin/email-templates"); revalidatePath("/admin/import");
    return { added: rows.length };
  });
}

export async function removeImportedTemplates() {
  return guarded("manageUsers", async (user) => {
    const r = await db.messageTemplate.deleteMany({ where: { fubKey: { not: null } } });
    await logActivity(user.id, "delete", "import", "fub-templates", `Removed ${r.count} templates copied from Follow Up Boss`);
    revalidatePath("/admin/text-templates"); revalidatePath("/admin/email-templates"); revalidatePath("/admin/import");
    return { removed: r.count };
  });
}

// ---------- History: notes, calls and texts onto timelines ----------
/** Imported people whose history comes over: everyone except partners (the agent database). */
const historyWhere = { fubId: { not: null }, deletedAt: null, partnerType: null } as const;

export async function historyCount() {
  return guarded("manageUsers", async () => ({ people: await db.person.count({ where: historyWhere }), copied: await db.timelineEntry.count({ where: { fubKey: { not: null } } }) }));
}

const CHUNK = 10;
export async function importHistory(input: { offset: number }) {
  return guarded("manageUsers", async (user) => {
    if (!fubKeySet()) throw new UserError("Add FUB_API_KEY in Railway first.");
    const { offset } = z.object({ offset: z.number().int().min(0) }).parse(input);
    const total = await db.person.count({ where: historyWhere });
    const people = await db.person.findMany({ where: historyWhere, orderBy: { id: "asc" }, skip: offset, take: CHUNK, select: { id: true, fubId: true, lastTextAt: true, lastContactAt: true } });
    const team = await db.user.findMany({ select: { id: true, name: true } });
    const authorOf = (n: string) => team.find((u) => u.name.toLowerCase() === n.trim().toLowerCase())?.id ?? null;
    let added = 0;
    for (const p of people) {
      const h = await fubHistoryFor(p.fubId!);
      const entries = [...h.notes.map(noteEntry), ...h.calls.map(callEntry), ...h.texts.map(textEntry)].filter((e): e is HistoryEntry => !!e);
      if (!entries.length) continue;
      const r = await db.timelineEntry.createMany({
        data: entries.map((e) => ({ personId: p.id, kind: e.kind, body: e.body, outcome: e.outcome, createdAt: new Date(e.createdAt), authorId: authorOf(e.author), fubKey: e.key })),
        skipDuplicates: true,
      });
      added += r.count;
      // Their last text / last contact move up to what the history shows (never back).
      const last = (k?: HistoryEntry["kind"]) => entries.filter((e) => !k || e.kind === k).reduce((m, e) => Math.max(m, Date.parse(e.createdAt)), 0);
      const lt = last("text"), lc = last();
      const data: { lastTextAt?: Date; lastContactAt?: Date } = {};
      if (lt && (!p.lastTextAt || p.lastTextAt.getTime() < lt)) data.lastTextAt = new Date(lt);
      if (lc && (!p.lastContactAt || p.lastContactAt.getTime() < lc)) data.lastContactAt = new Date(lc);
      if (data.lastTextAt || data.lastContactAt) await db.person.update({ where: { id: p.id }, data });
    }
    const next = offset + people.length, done = next >= total || people.length === 0;
    if (done) { await logActivity(user.id, "create", "import", "fub-history", "Copied notes, calls and texts from Follow Up Boss"); revalidatePath("/admin/import"); }
    return { next, total, added, done };
  });
}

export async function removeImportedHistory() {
  return guarded("manageUsers", async (user) => {
    const r = await db.timelineEntry.deleteMany({ where: { fubKey: { not: null } } });
    await logActivity(user.id, "delete", "import", "fub-history", `Removed ${r.count} timeline entries copied from Follow Up Boss`);
    revalidatePath("/admin/import");
    return { removed: r.count };
  });
}
