import { adminGate } from "../gate";
import { loadTemplates } from "@/server/automation";
import { loadStatuses } from "@/server/files";
import { loadTeam } from "@/server/tasks";
import { db } from "@/server/db";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { TemplatesClient } from "./TemplatesClient";
import { loadForm } from "@/server/pa";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const denied = await adminGate("editTaskTemplates");
  if (denied) return denied;
  const [templates, statuses, team, tags, sp, messages, stages] = await Promise.all([loadTemplates(), loadStatuses(), loadTeam(), db.tag.findMany({ orderBy: { name: "asc" } }), searchParams,
    db.messageTemplate.findMany({ orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, kind: true, name: true, folder: true } }), db.stage.findMany({ orderBy: { position: "asc" } })]);
  // Who an automatic step can send to: the purchase agreements' people sections (lender, title, agents), both sides.
  const roles = new Map<string, string>();
  for (const sec of [...(await loadForm("buyer")), ...(await loadForm("seller"))]) if (sec.people && !roles.has(sec.id)) roles.set(sec.id, sec.name);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Task templates</h1>
      <p className="mb-4 mt-1 text-sm muted">
        A template is a list of steps that become tasks. It starts when a deal enters a stage, when a purchase agreement is added or closes, when a phone call is booked, or when you apply it from a contact.
        Due dates count from the start date or a contract date and move when that date changes. If the date isn&apos;t set yet, the task waits for it.
      </p>
      <TemplatesClient roles={[...roles].map(([id, name]) => ({ id, name }))} messages={messages} templates={templates} statuses={[...statuses.buyer, ...statuses.listing]} team={team.map((m) => m.name.split(/\s+/)[0])}
        tags={tags.map((t) => t.name)} stages={stages.map((s) => s.name)} today={isoFromDate(todayCentral())} initialId={sp.t ?? templates[0]?.id ?? null} />
    </>
  );
}
