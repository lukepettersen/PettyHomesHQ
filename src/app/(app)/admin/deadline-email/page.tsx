import { adminGate } from "../gate";
import { db } from "@/server/db";
import { buildDigest, loadDigestSettings } from "@/server/deadlineDigest";
import { DeadlineEmailClient } from "./DeadlineEmailClient";

export const dynamic = "force-dynamic";

/** Admin → Weekly deadlines email (owner request 2026-11-04). */
export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [settings, team] = await Promise.all([loadDigestSettings(), db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { name: true, email: true, isOwner: true } })]);
  const owner = team.find((u) => u.isOwner);
  const preview = await buildDigest(owner?.name.split(/\s+/)[0] ?? "");
  return (
    <>
      <h1 className="text-2xl font-extrabold">Weekly deadlines email</h1>
      <p className="mb-4 mt-1 text-sm muted">Once a week HQ emails the contingency deadlines (inspection, Written Statement, HOA rescission) still open on every active contract, for this week and next, split into buyers and sellers. Met and waived ones are left out.</p>
      <DeadlineEmailClient initial={{ ...settings, to: settings.to.length ? settings.to : owner ? [owner.email] : [] }} team={team.map((u) => ({ first: u.name.split(/\s+/)[0], name: u.name }))} preview={preview} />
    </>
  );
}
