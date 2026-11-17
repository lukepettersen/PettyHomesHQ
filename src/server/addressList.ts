import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { UserError } from "@/server/safe";
import { hasAddress, listAddress, listMailingName, listName, matchRow, readAddressList, type ApplyInput, type HqPerson, type ListRow, type Match } from "@/lib/addressList";

// Import address list (SPEC.md §6.5, owner request 2026-11-04). Preview first, then save; every import can be undone.

export type PreviewRow = { row: ListRow; name: string; address: string; matches: Match[] };

async function hqPeople(): Promise<HqPerson[]> {
  const people = await db.person.findMany({ where: { deletedAt: null }, select: { id: true, name: true, address: true, addresses: { select: { value: true } } } });
  return people.map((p) => ({ id: p.id, name: p.name, addresses: [...new Set([...(p.address ? [p.address] : []), ...p.addresses.map((a) => a.value)])] }));
}

export async function previewAddressList(csv: string): Promise<PreviewRow[]> {
  const { rows, problem } = readAddressList(csv);
  if (problem) throw new UserError(problem);
  const people = await hqPeople();
  return rows.map((r) => ({ row: r, name: listName(r), address: listAddress(r), matches: matchRow(r, people) }));
}

type UndoRecord = { tags: [string, string][]; addresses: { id: string; personId: string; prevAddress: string | null; prevMailingId: string | null }[]; mailingNames: string[] };

export async function applyAddressList(userId: string, input: ApplyInput) {
  const rows = input.rows.filter((r) => r.action !== "skip");
  if (!rows.length) throw new UserError("Everyone is set to Skip.");
  const tagId = async (name: string) => (await db.tag.upsert({ where: { name }, update: {}, create: { name } })).id;
  const tagIds = { card: await tagId(input.tags.card), family: "", friend: "", wife: "" };
  for (const g of ["family", "friend", "wife"] as const) if (rows.some((r) => r.group === g)) tagIds[g] = await tagId(input.tags[g]);
  let stage = await db.stage.findUnique({ where: { name: input.stage } });
  if (!stage && rows.some((r) => r.action === "new")) {
    const last = await db.stage.findFirst({ orderBy: { position: "desc" } });
    stage = await db.stage.create({ data: { name: input.stage, position: (last?.position ?? 0) + 1 } });
  }

  const batch = await db.importBatch.create({ data: { kind: "addresses", createdById: userId } });
  const undo: UndoRecord = { tags: [], addresses: [], mailingNames: [] };
  let added = 0, matched = 0;
  const tag = async (personId: string, id: string) => {
    if (!id) return;
    const had = await db.personTag.findUnique({ where: { personId_tagId: { personId, tagId: id } } });
    if (had) return;
    await db.personTag.create({ data: { personId, tagId: id } });
    undo.tags.push([personId, id]);
  };

  for (const r of rows) {
    const address = listAddress(r.row);
    const mailingName = listMailingName(r.row);
    if (r.action === "new" || !r.personId) {
      const p = await db.person.create({
        data: { name: listName(r.row).slice(0, 200), mailingName, address, stageId: stage?.id ?? null, createdById: userId, importBatchId: batch.id, addresses: { create: { label: "Home", value: address, mailing: true } } },
      });
      await db.personTag.create({ data: { personId: p.id, tagId: tagIds.card } });
      if (r.group) await db.personTag.create({ data: { personId: p.id, tagId: tagIds[r.group] } });
      added++;
      continue;
    }
    const p = await db.person.findFirst({ where: { id: r.personId, deletedAt: null }, include: { addresses: { orderBy: { position: "asc" } } } });
    if (!p) continue;
    matched++;
    await tag(p.id, tagIds.card);
    if (r.group) await tag(p.id, tagIds[r.group]);
    if (!p.mailingName && mailingName) { await db.person.update({ where: { id: p.id }, data: { mailingName } }); undo.mailingNames.push(p.id); }
    // Their address: added when they have none; when it's different, it becomes the mailing address if "Use for mail" is on.
    const values = [...p.addresses.map((a) => a.value), ...(p.address ? [p.address] : [])];
    if (hasAddress(values, r.row) || (values.length && !r.useAddress)) continue;
    const prevMailing = p.addresses.find((a) => a.mailing) ?? null;
    await db.address.updateMany({ where: { personId: p.id }, data: { mailing: false } });
    const a = await db.address.create({ data: { personId: p.id, label: values.length ? "Mailing" : "Home", value: address, mailing: true, position: p.addresses.length } });
    await db.person.update({ where: { id: p.id }, data: { address } });
    undo.addresses.push({ id: a.id, personId: p.id, prevAddress: p.address, prevMailingId: prevMailing?.id ?? null });
  }

  await db.importBatch.update({ where: { id: batch.id }, data: { added, duplicates: matched } });
  await db.appSetting.create({ data: { key: `addressImport.${batch.id}`, value: undo } });
  await logActivity(userId, "create", "import", batch.id, `Imported an address list: ${added} added, ${matched} matched and tagged ${input.tags.card}`);
  return { added, matched };
}

/** Undo: removes the people it added, and takes back its tags, addresses and mailing names on people who were already in HQ. */
export async function undoAddressList(userId: string, batchId: string) {
  const b = await db.importBatch.findFirst({ where: { id: batchId, kind: "addresses" } });
  if (!b || b.undoneAt) throw new UserError("That import was already undone.");
  const rec = (await db.appSetting.findUnique({ where: { key: `addressImport.${b.id}` } }))?.value as UndoRecord | undefined;
  const removed = await db.person.deleteMany({ where: { importBatchId: b.id, documents: { none: {} }, files: { none: {} } } });
  if (rec) {
    for (const [personId, tagId] of rec.tags) await db.personTag.deleteMany({ where: { personId, tagId } });
    for (const a of rec.addresses) {
      await db.address.deleteMany({ where: { id: a.id } });
      if (a.prevMailingId) await db.address.updateMany({ where: { id: a.prevMailingId }, data: { mailing: true } });
      await db.person.updateMany({ where: { id: a.personId }, data: { address: a.prevAddress } });
    }
    if (rec.mailingNames.length) await db.person.updateMany({ where: { id: { in: rec.mailingNames } }, data: { mailingName: null } });
  }
  await db.importBatch.update({ where: { id: b.id }, data: { undoneAt: new Date() } });
  await logActivity(userId, "delete", "import", b.id, `Undid an address list import: removed ${removed.count} people`);
  return { removed: removed.count };
}

export async function loadAddressImports() {
  const rows = await db.importBatch.findMany({ where: { kind: "addresses" }, orderBy: { createdAt: "desc" }, take: 10 });
  return rows.map((b) => ({ id: b.id, at: b.createdAt.toISOString(), added: b.added, matched: b.duplicates, undone: !!b.undoneAt }));
}
