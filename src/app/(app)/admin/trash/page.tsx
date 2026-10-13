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
  return (
    <>
      <h1 className="text-2xl font-extrabold">Trash</h1>
      <p className="mb-4 mt-1 text-sm muted">Deleted people stay here for {TRASH_DAYS} days, then they&apos;re removed for good along with their notes and tasks.</p>
      <div className="card">
        {rows.length ? rows.map((r) => <TrashRow key={r.id} {...r} />) : <p className="p-6 text-center muted">Trash is empty.</p>}
      </div>
    </>
  );
}
