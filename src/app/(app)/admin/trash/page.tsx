import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { purgeTrash, TRASH_DAYS } from "@/server/trash";
import { TrashRow } from "./TrashRow";
import { daysAgo } from "@/lib/normalize";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  if (!hasPermission(user.permissions, "deleteRecords")) return <p className="muted">Only an Admin can open Trash.</p>;
  await purgeTrash();
  const people = await db.person.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } });
  const rows = people.map((p) => ({ id: p.id, name: p.name, left: TRASH_DAYS - (daysAgo(p.deletedAt) ?? 0) }));
  const tasks = await db.task.findMany({ where: { deletedAt: { not: null }, OR: [{ personId: null }, { person: { deletedAt: null } }] }, orderBy: { deletedAt: "desc" }, include: { person: { select: { name: true } } } });
  const taskRows = tasks.map((t) => ({ id: t.id, name: t.title, detail: t.person?.name, left: TRASH_DAYS - (daysAgo(t.deletedAt) ?? 0) }));
  return (
    <>
      <h1 className="text-2xl font-extrabold">Trash</h1>
      <p className="mb-4 mt-1 text-sm muted">Deleted people and tasks stay here for {TRASH_DAYS} days, then they&apos;re removed for good (a person&apos;s notes and tasks go with them).</p>
      <h2 className="mb-2 font-bold">People</h2>
      <div className="card">
        {rows.length ? rows.map((r) => <TrashRow key={r.id} {...r} />) : <p className="p-6 text-center muted">No deleted people.</p>}
      </div>
      <h2 className="mt-6 mb-2 font-bold">Tasks</h2>
      <div className="card">
        {taskRows.length ? taskRows.map((r) => <TrashRow key={r.id} kind="task" {...r} />) : <p className="p-6 text-center muted">No deleted tasks.</p>}
      </div>
    </>
  );
}
