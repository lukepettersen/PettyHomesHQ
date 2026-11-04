import { adminGate } from "../gate";
import { db } from "@/server/db";
import { buildDigest, loadDigestSettings } from "@/server/deadlineDigest";
import { REPORTS } from "@/lib/deadlineDigest";
import { DeadlineEmailClient } from "./DeadlineEmailClient";

export const dynamic = "force-dynamic";

/** Admin → Weekly emails (owner requests 2026-11-04): contingency deadlines, closings and listings, each on its own schedule. */
export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const team = await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { name: true, email: true, isOwner: true } });
  const owner = team.find((u) => u.isOwner);
  const first = owner?.name.split(/\s+/)[0] ?? "";
  const reports = await Promise.all(REPORTS.map(async (r) => ({ ...r, settings: await loadDigestSettings(r.kind), preview: await buildDigest(first, r.kind) })));
  return (
    <>
      <h1 className="text-2xl font-extrabold">Weekly emails</h1>
      <p className="mb-4 mt-1 text-sm muted">Reports HQ builds from your deals and emails out once a week, each on its own day and time. Each starts off: check the preview, send yourself a test, then turn it on.</p>
      <div className="flex flex-col gap-6">
        {reports.map((r) => (
          <section key={r.kind} aria-labelledby={`r-${r.kind}`}>
            <h2 id={`r-${r.kind}`} className="text-lg font-bold">{r.name}</h2>
            <p className="mb-2 text-sm muted">{r.blurb}</p>
            <DeadlineEmailClient kind={r.kind} initial={{ ...r.settings, to: r.settings.to.length ? r.settings.to : owner ? [owner.email] : [] }} team={team.map((u) => ({ first: u.name.split(/\s+/)[0], name: u.name }))} preview={r.preview} />
          </section>
        ))}
      </div>
    </>
  );
}
