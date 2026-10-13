"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded, UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { ALL_PERMISSIONS } from "@/server/permissions";
import { allowedDomain } from "@/server/access";

const item = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Names can't be empty").max(80) });
const items = z.array(item).max(100);

function noDuplicates(names: string[]) {
  const seen = new Set<string>();
  for (const n of names) { const k = n.toLowerCase(); if (seen.has(k)) throw new UserError(`"${n}" is listed twice.`); seen.add(k); }
}

/** Stages and sources: rename, reorder, add, remove. Removing one that people use is blocked. */
export async function saveNamedList(kind: "stage" | "source", input: z.input<typeof items>) {
  return guarded("manageUsers", async (user) => {
    const list = items.parse(input);
    noDuplicates(list.map((i) => i.name));
    const model = kind === "stage" ? db.stage : db.source;
    const existing: { id: string; name: string }[] = await (model as typeof db.stage).findMany();
    const keep = new Set(list.filter((i) => i.id).map((i) => i.id));
    for (const gone of existing.filter((e) => !keep.has(e.id))) {
      const used = await db.person.count({ where: { deletedAt: null, ...(kind === "stage" ? { stageId: gone.id } : { sourceId: gone.id }) } });
      if (used) throw new UserError(`${used} ${used === 1 ? "person has" : "people have"} the ${kind} "${gone.name}". Change them first.`);
    }
    await db.$transaction(async (tx) => {
      const m = (kind === "stage" ? tx.stage : tx.source) as typeof tx.stage;
      const removed = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (removed.length) {
        // Clear the link on people already in Trash, then remove.
        await tx.person.updateMany({ where: kind === "stage" ? { stageId: { in: removed } } : { sourceId: { in: removed } }, data: kind === "stage" ? { stageId: null } : { sourceId: null } });
        await m.deleteMany({ where: { id: { in: removed } } });
      }
      // Two passes avoid unique-name clashes when names are swapped.
      for (const [i, it] of list.entries()) if (it.id) await m.update({ where: { id: it.id }, data: { name: `__tmp_${i}_${it.id}` } });
      for (const [i, it] of list.entries()) {
        if (it.id) await m.update({ where: { id: it.id }, data: { name: it.name, position: i } });
        else await m.create({ data: { name: it.name, position: i } });
      }
    });
    await logActivity(user.id, "update", kind, null, `Updated ${kind}s: ${list.map((i) => i.name).join(", ")}`);
    revalidatePath("/admin/lists");
  });
}

export async function saveFollowUp(input: number[]) {
  return guarded("manageUsers", async (user) => {
    const days = z.array(z.coerce.number().int().min(1, "Use 1 day or more").max(3650)).max(30).parse(input);
    const unique = [...new Set(days)];
    await db.$transaction([db.followUpOption.deleteMany({}), db.followUpOption.createMany({ data: unique.map((d, position) => ({ days: d, position })) })]);
    await logActivity(user.id, "update", "followUp", null, `Follow-up options: ${unique.join(", ")} days`);
    revalidatePath("/admin/lists");
  });
}

/** Tags: rename updates everyone (same row), delete removes the tag from everyone. */
export async function saveTags(input: z.input<typeof items>) {
  return guarded("manageUsers", async (user) => {
    const list = items.parse(input);
    noDuplicates(list.map((i) => i.name));
    const existing = await db.tag.findMany();
    const keep = new Set(list.filter((i) => i.id).map((i) => i.id));
    await db.$transaction(async (tx) => {
      await tx.tag.deleteMany({ where: { id: { in: existing.filter((e) => !keep.has(e.id)).map((e) => e.id) } } });
      for (const it of list.filter((i) => i.id)) await tx.tag.update({ where: { id: it.id }, data: { name: `__tmp_${it.id}` } });
      for (const it of list) {
        if (it.id) await tx.tag.update({ where: { id: it.id }, data: { name: it.name } });
        else await tx.tag.create({ data: { name: it.name } });
      }
    });
    await logActivity(user.id, "update", "tag", null, `Updated tags (${list.length})`);
    revalidatePath("/admin/tags");
  });
}

// ---------- Users & roles ----------
const userRow = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Add a name").max(80), email: z.string().trim().toLowerCase().email("Check the email address"), roleId: z.string(), disabled: z.boolean() });
const roleRow = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Role names can't be empty").max(40), permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])) });

export async function saveTeam(input: { users: z.input<typeof userRow>[]; roles: z.input<typeof roleRow>[] }) {
  return guarded("manageUsers", async (me) => {
    const users = z.array(userRow).max(50).parse(input.users);
    const roles = z.array(roleRow).min(1).max(20).parse(input.roles);
    noDuplicates(roles.map((r) => r.name));
    noDuplicates(users.map((u) => u.email));
    for (const u of users) if (!u.email.endsWith("@" + allowedDomain())) throw new UserError(`${u.email} isn't a @${allowedDomain()} address.`);
    const owner = await db.user.findFirst({ where: { isOwner: true } });
    const ownerRow = users.find((u) => u.id === owner?.id);
    if (owner && (!ownerRow || ownerRow.disabled)) throw new UserError("The owner can't be removed or disabled.");

    await db.$transaction(async (tx) => {
      const existingRoles = await tx.role.findMany();
      const idMap = new Map<string, string>(); // temp key → real id for new roles
      for (const [i, r] of roles.entries()) {
        if (r.id) { await tx.role.update({ where: { id: r.id }, data: { name: `__tmp_${i}`, permissions: r.permissions } }); idMap.set(r.id, r.id); }
      }
      for (const [i, r] of roles.entries()) {
        if (r.id) await tx.role.update({ where: { id: r.id }, data: { name: r.name } });
        else { const created = await tx.role.create({ data: { name: r.name, permissions: r.permissions } }); idMap.set(`new:${i}`, created.id); }
      }
      // Owner always keeps every permission through an Admin-equivalent role.
      if (ownerRow) {
        const ownerRole = roles.find((r, i) => (r.id ?? `new:${i}`) === ownerRow.roleId);
        if (!ownerRole || ownerRole.permissions.length !== ALL_PERMISSIONS.length) throw new UserError("The owner's role must keep every permission.");
      }
      const existingUsers = await tx.user.findMany();
      for (const u of users) {
        const roleId = idMap.get(u.roleId);
        if (!roleId) throw new UserError(`Pick a role for ${u.name}.`);
        const data = { name: u.name, email: u.email, roleId, status: u.disabled ? ("DISABLED" as const) : undefined };
        if (u.id) {
          const prev = existingUsers.find((x) => x.id === u.id);
          await tx.user.update({ where: { id: u.id }, data: { ...data, status: u.disabled ? "DISABLED" : prev?.status === "DISABLED" ? "INVITED" : prev?.status } });
        } else await tx.user.create({ data: { ...data, status: "INVITED" } });
      }
      const keepRoles = new Set(idMap.values());
      for (const r of existingRoles.filter((r) => !keepRoles.has(r.id))) {
        if (await tx.user.count({ where: { roleId: r.id } })) throw new UserError(`Someone still has the role "${r.name}". Change their role first.`);
        await tx.role.delete({ where: { id: r.id } });
      }
    });
    await logActivity(me.id, "update", "team", null, `Updated users (${users.length}) and roles (${roles.length})`);
    revalidatePath("/admin/users");
  });
}
