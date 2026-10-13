import { adminGate } from "../gate";
import { db } from "@/server/db";
import { TagsClient } from "./TagsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const tags = await db.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { people: { where: { person: { deletedAt: null } } } } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold">Tags</h1>
      <p className="mb-4 mt-1 text-sm muted">Renaming a tag updates everyone who has it. Removing a tag takes it off everyone.</p>
      <TagsClient tags={tags.map((t) => ({ id: t.id, name: t.name, count: t._count.people }))} />
    </>
  );
}
