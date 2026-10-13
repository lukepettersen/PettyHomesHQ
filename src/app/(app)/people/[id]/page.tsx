import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { loadOptions } from "@/server/people";
import { loadChecklists, loadPersonTasks } from "@/server/tasks";
import { loadTemplates } from "@/server/automation";
import { loadPersonAppointments } from "@/server/appointments";
import { loadFileForm, loadPersonFiles, loadStatuses } from "@/server/files";
import { loadForm, loadPersonContracts } from "@/server/pa";
import { daysAgo, isoFromDate } from "@/lib/normalize";
import { InfoCard, DetailsCard, CustomFieldsCard, TagsCard, DatesCard, DeletePerson } from "./cards";
import { Timeline } from "./Timeline";
import { TasksCard } from "./TasksCard";
import { FileTabs } from "./FileTabs";
import { PipelineCard } from "./PipelineCard";
import { AppointmentsCard } from "./AppointmentsCard";

const BACK: Record<string, [string, string]> = { tasks: ["/tasks", "Tasks"], people: ["/people", "People"], pipeline: ["/pipeline", "Pipeline"] };

export const dynamic = "force-dynamic";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const [backHref, backLabel] = BACK[(await searchParams).from ?? ""] ?? BACK.people;
  const user = await requireUser();
  const [p, options, tasks, fields, files, statuses, contracts, buyerForm, sellerForm, checklists, templates] = await Promise.all([
    db.person.findFirst({
      where: { id, deletedAt: null },
      include: {
        stage: true, source: true, assignedTo: { select: { id: true, name: true } },
        phones: { orderBy: { position: "asc" } }, emails: { orderBy: { position: "asc" } },
        tags: { include: { tag: true } }, dates: true, customValues: true,
        timeline: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      },
    }),
    loadOptions(),
    loadPersonTasks(id),
    db.customField.findMany({ orderBy: { position: "asc" } }),
    loadPersonFiles(id, user),
    loadStatuses(),
    loadPersonContracts(id, user),
    loadForm("buyer"),
    loadForm("seller"),
    loadChecklists(id),
    loadTemplates(),
  ]);
  const canSeeCommission = hasPermission(user.permissions, "seeCommissions");
  const fileStatuses = { buyer: statuses.buyer, listing: statuses.listing };
  if (!p) notFound();
  const [appts, buyerFileForm, listingFileForm, taskLists] = await Promise.all([loadPersonAppointments(id, p.name), loadFileForm("buyer"), loadFileForm("listing"),
    db.taskList.findMany({ where: { builtin: null }, orderBy: { position: "asc" } })]);
  const fileForms = { buyer: buyerFileForm, listing: listingFileForm };

  const birthdays = p.dates.filter((d) => d.kind === "birthday").map((d) => ({ whose: d.whose, date: isoFromDate(d.date) }));
  const home = p.dates.find((d) => d.kind === "homeiversary");

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-3">
      <Link href={backHref} className="link text-sm">← {backLabel}</Link>
      <div className="mt-2 grid grid-cols-1 items-start gap-3 lg:grid-cols-[290px_minmax(0,1fr)_300px]">
        {/* On a phone: contact info, then Tasks, then Timeline, then the other cards (SPEC.md §17). */}
        <div className="contents lg:sticky lg:top-3 lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
          <div className="order-1 min-w-0">
            <InfoCard id={p.id} name={p.name} address={p.address ?? ""} lastContactDays={daysAgo(p.lastContactAt)}
              phones={p.phones.map((x) => ({ label: x.label, value: x.number }))} emails={p.emails.map((x) => ({ label: x.label, value: x.address }))} />
          </div>
          <div className="order-4 flex min-w-0 flex-col gap-3">
            <DetailsCard id={p.id} options={options} stageId={p.stageId} sourceId={p.sourceId} assignedToId={p.assignedToId}
              followUpDays={p.followUpDays} mailingName={p.mailingName ?? ""} referredBy={p.referredBy ?? ""} />
            <CustomFieldsCard id={p.id} fields={fields.map((f) => ({ fieldId: f.id, name: f.name, type: f.type, options: f.options, value: p.customValues.find((v) => v.fieldId === f.id)?.value ?? "" }))} />
            <TagsCard id={p.id} tags={p.tags.map((t) => t.tag.name).sort()} allTags={options.tags} />
            <DatesCard id={p.id} name={p.name} birthdays={birthdays} homeiversary={home ? isoFromDate(home.date) : ""} />
            {hasPermission(user.permissions, "deleteRecords") && <DeletePerson id={p.id} name={p.name} />}
          </div>
        </div>

        <section className="order-3 min-w-0 lg:order-2">
          <FileTabs fileForms={fileForms} personId={p.id} personName={p.name} files={files} statuses={fileStatuses} canSeeCommission={canSeeCommission}
            canDelete={hasPermission(user.permissions, "deleteRecords")} contracts={contracts} forms={{ buyer: buyerForm, seller: sellerForm }} today={tasks.today} checklists={checklists} team={tasks.team} timeline={<Timeline personId={p.id} team={tasks.team.map((m) => ({ id: m.id, name: m.name }))} entries={p.timeline.map((e) => ({ id: e.id, kind: e.kind, body: e.body, outcome: e.outcome, author: e.author?.name ?? null, at: e.createdAt.toISOString() }))} />} />
        </section>

        <aside className="order-2 flex min-w-0 flex-col gap-3 lg:sticky lg:top-3 lg:order-3">
          <TasksCard lists={taskLists.map((l) => ({ id: l.id, name: l.name, builtin: null, showOnToday: l.showOnToday }))} personId={p.id} personName={p.name} rows={tasks.rows} team={tasks.team} today={tasks.today} meId={user.id}
            templates={templates.map((t) => ({ id: t.id, name: t.name, manual: !t.trigger }))} files={files.filter((f) => !f.closedAt).map((f) => ({ id: f.id, label: `${f.kind === "buyer" ? "Buyer" : "Listing"} · ${f.kind === "buyer" ? f.status : (f.address ?? "").split(",")[0]}` }))} />
          <PipelineCard fileForms={fileForms} personId={p.id} personName={p.name} files={files} contracts={contracts} statuses={fileStatuses} canSeeCommission={canSeeCommission} />
          <AppointmentsCard fileForms={fileForms} personId={p.id} personName={p.name} appts={appts} today={tasks.today} phone={p.phones[0]?.number ?? ""} address={p.address ?? ""} hasEmail={p.emails.length > 0}
            team={tasks.team.map((m) => m.name)} callTemplates={templates.filter((t) => t.trigger === "phonecall").map((t) => ({ name: t.name, steps: t.phases.reduce((n, ph) => n + ph.steps.length, 0) }))}
            activeKinds={files.filter((f) => !f.closedAt).map((f) => f.kind)} statuses={fileStatuses} canSeeCommission={canSeeCommission} />
        </aside>
      </div>
    </div>
  );
}
