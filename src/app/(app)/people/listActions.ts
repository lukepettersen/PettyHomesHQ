"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { FIELD_LABELS } from "@/lib/filters";
import { COLUMNS } from "@/lib/columns";

const filterSchema = z.array(z.object({ field: z.enum(Object.keys(FIELD_LABELS) as [string, ...string[]]), op: z.string().max(20), value: z.string().max(2000) })).max(20);
const name = z.string().trim().min(1, "Give it a name").max(80);
const done = () => revalidatePath("/people");

export async function createSmartList(input: { name: string; collectionId?: string; newCollection?: string; filters: unknown }) {
  return guarded(null, async (user) => {
    const filters = filterSchema.parse(input.filters);
    let collectionId = input.collectionId;
    if (!collectionId || collectionId === "__new") {
      const n = name.parse(input.newCollection || "New collection");
      const count = await db.collection.count();
      collectionId = (await db.collection.create({ data: { name: n, position: count } })).id;
    }
    const position = await db.smartList.count({ where: { collectionId } });
    const list = await db.smartList.create({ data: { name: name.parse(input.name), collectionId, position, filters } });
    await logActivity(user.id, "create", "smartList", list.id, `Created smart list ${list.name}`);
    done();
    return { id: list.id };
  });
}

export async function saveSmartListFilters(id: string, filters: unknown) {
  return guarded(null, async (user) => {
    const list = await db.smartList.update({ where: { id }, data: { filters: filterSchema.parse(filters) } });
    await logActivity(user.id, "update", "smartList", id, `Changed filters on ${list.name}`);
    done();
  });
}

export async function renameSmartList(id: string, newName: string) {
  return guarded(null, async (user) => {
    const list = await db.smartList.update({ where: { id }, data: { name: name.parse(newName) } });
    await logActivity(user.id, "update", "smartList", id, `Renamed smart list to ${list.name}`);
    done();
  });
}

export async function duplicateSmartList(id: string) {
  return guarded(null, async (user) => {
    const src = await db.smartList.findUniqueOrThrow({ where: { id } });
    await db.smartList.updateMany({ where: { collectionId: src.collectionId, position: { gt: src.position } }, data: { position: { increment: 1 } } });
    const copy = await db.smartList.create({ data: { name: `${src.name} copy`, collectionId: src.collectionId, position: src.position + 1, filters: src.filters ?? [] } });
    await logActivity(user.id, "create", "smartList", copy.id, `Duplicated ${src.name}`);
    done();
    return { id: copy.id };
  });
}

export async function deleteSmartList(id: string) {
  return guarded(null, async (user) => {
    const list = await db.smartList.delete({ where: { id } });
    await logActivity(user.id, "delete", "smartList", id, `Deleted smart list ${list.name}`);
    done();
  });
}

/** Saves the whole sidebar order at once: collections in order, each with its lists in order. Used by drag and drop and the ⋯ menus. */
export async function saveSidebarOrder(input: { id: string; lists: string[] }[]) {
  return guarded(null, async (user) => {
    const order = z.array(z.object({ id: z.string(), lists: z.array(z.string()).max(200) })).max(100).parse(input);
    const known = new Set((await db.smartList.findMany({ select: { id: true } })).map((l) => l.id));
    const seen = new Set<string>();
    for (const c of order) for (const l of c.lists) { if (!known.has(l) || seen.has(l)) throw new UserError("The list order is out of date. Refresh and try again."); seen.add(l); }
    await db.$transaction([
      ...order.map((c, i) => db.collection.update({ where: { id: c.id }, data: { position: i } })),
      ...order.flatMap((c) => c.lists.map((l, i) => db.smartList.update({ where: { id: l }, data: { collectionId: c.id, position: i } }))),
    ]);
    await logActivity(user.id, "update", "smartList", null, "Rearranged smart lists");
    done();
  });
}

export async function createCollection(newName: string) {
  return guarded(null, async (user) => {
    const c = await db.collection.create({ data: { name: name.parse(newName), position: await db.collection.count() } });
    await logActivity(user.id, "create", "collection", c.id, `Created collection ${c.name}`);
    done();
    return { id: c.id };
  });
}

export async function renameCollection(id: string, newName: string) {
  return guarded(null, async (user) => {
    const c = await db.collection.update({ where: { id }, data: { name: name.parse(newName) } });
    await logActivity(user.id, "update", "collection", id, `Renamed collection to ${c.name}`);
    done();
  });
}

export async function deleteCollection(id: string) {
  return guarded(null, async (user) => {
    const count = await db.smartList.count({ where: { collectionId: id } });
    if (count) throw new UserError(`Move or delete its ${count} list${count === 1 ? "" : "s"} first.`);
    const c = await db.collection.delete({ where: { id } });
    await logActivity(user.id, "delete", "collection", id, `Deleted collection ${c.name}`);
    done();
  });
}

/** Columns on the People table for a smart list, or All people when listId is null. */
export async function saveColumns(listId: string | null, columns: unknown) {
  return guarded(null, async (user) => {
    const cols = z.array(z.enum(COLUMNS.map(([k]) => k) as [string, ...string[]])).min(1, "Pick at least one column.").max(COLUMNS.length).parse(columns);
    if (listId) {
      const list = await db.smartList.update({ where: { id: z.string().max(40).parse(listId) }, data: { columns: cols } });
      await logActivity(user.id, "update", "smartList", list.id, `Changed columns on ${list.name}`);
    } else {
      await db.appSetting.upsert({ where: { key: "people.columns" }, update: { value: cols }, create: { key: "people.columns", value: cols } });
      await logActivity(user.id, "update", "setting", "people.columns", "Changed columns on All people");
    }
    done();
  });
}
