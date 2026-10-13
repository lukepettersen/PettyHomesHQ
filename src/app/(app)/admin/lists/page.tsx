import { db } from "@/server/db";
import { ListsClient } from "./ListsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [stages, sources, follow, stageCounts, sourceCounts] = await Promise.all([
    db.stage.findMany({ orderBy: { position: "asc" } }),
    db.source.findMany({ orderBy: { position: "asc" } }),
    db.followUpOption.findMany({ orderBy: { position: "asc" } }),
    db.person.groupBy({ by: ["stageId"], where: { deletedAt: null }, _count: true }),
    db.person.groupBy({ by: ["sourceId"], where: { deletedAt: null }, _count: true }),
  ]);
  const sc = new Map(stageCounts.map((r) => [r.stageId, r._count]));
  const oc = new Map(sourceCounts.map((r) => [r.sourceId, r._count]));
  return (
    <>
      <h1 className="text-2xl font-extrabold">Stages, sources &amp; follow-up</h1>
      <p className="mb-4 mt-1 text-sm muted">The choices on every person. A stage or source can&apos;t be removed while people have it.</p>
      <ListsClient
        stages={stages.map((s) => ({ id: s.id, name: s.name, count: sc.get(s.id) ?? 0 }))}
        sources={sources.map((s) => ({ id: s.id, name: s.name, count: oc.get(s.id) ?? 0 }))}
        follow={follow.map((f) => f.days)} />
    </>
  );
}
