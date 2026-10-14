import { adminGate } from "../gate";
import { db } from "@/server/db";
import { cachedFubPeople, fubKeySet } from "@/server/fub";
import { defaultPlan, summarize, type Plan } from "@/lib/fubImport";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate("manageUsers");
  if (denied) return denied;
  const [{ people, loadedAt }, stages, sources, users, saved, batches] = await Promise.all([
    cachedFubPeople(), db.stage.findMany({ orderBy: { position: "asc" } }), db.source.findMany({ orderBy: { position: "asc" } }),
    db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.appSetting.findUnique({ where: { key: "fub.plan" } }), db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const summary = summarize(people);
  const hq = { stages: stages.map((s) => s.name), sources: sources.map((s) => s.name), users };
  const suggested = defaultPlan(summary, hq);
  // A saved matching wins; anything new in FUB since then gets the suggestion.
  const s = (saved?.value ?? null) as Plan | null;
  const plan: Plan = s ? {
    fields: s.fields ?? suggested.fields,
    stages: { ...suggested.stages, ...s.stages }, tags: { ...suggested.tags, ...s.tags }, sources: { ...suggested.sources, ...s.sources }, agents: { ...suggested.agents, ...s.agents },
  } : suggested;
  return (
    <>
      <h1 className="text-2xl font-extrabold">Import from Follow Up Boss</h1>
      <p className="mb-4 mt-1 text-sm muted">Copies your contacts from Follow Up Boss into HQ. Nothing in Follow Up Boss is changed, people already in HQ are never added twice, and every import can be undone.</p>
      <ImportClient keySet={fubKeySet()} loadedAt={loadedAt} summary={summary} plan={plan} planSaved={!!s} hq={hq}
        batches={batches.map((b) => ({ id: b.id, at: b.createdAt.toISOString(), added: b.added, duplicates: b.duplicates, undone: !!b.undoneAt }))} />
    </>
  );
}
