import { pendingKeys } from "@/lib/pa";
import { loadScheduledFor } from "@/server/scheduledTexts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { loadOptions } from "@/server/people";
import { loadChecklists, loadPersonTasks } from "@/server/tasks";
import { loadTemplates } from "@/server/automation";
import { loadApptTypes, loadPersonAppointments } from "@/server/appointments";
import { calendarConnection, emailConnection, googleKeysSet } from "@/server/google";
import { loadFileForm, loadPersonFiles, loadStatuses } from "@/server/files";
import { loadForm, loadPersonContracts } from "@/server/pa";
import { daysAgo, isoFromDate } from "@/lib/normalize";
import { InfoCard, DetailsCard, CustomFieldsCard, TagsCard, DatesCard, DeletePerson } from "./cards";
import { Timeline } from "./Timeline";
import { TaskTrail } from "@/components/TaskTrail";
import { textComposerFor } from "@/server/texting";
import { canEditEntry } from "@/lib/timeline";
import { TEXT_STOP_TAG } from "@/lib/texting";
import { formatPhone } from "@/lib/normalize";
import { TasksCard } from "./TasksCard";
import { FileTabs } from "./FileTabs";
import { PipelineCard } from "./PipelineCard";
import { AppointmentsCard } from "./AppointmentsCard";
import { FilesCard } from "./FilesCard";
import { PartnerDeals } from "./PartnerDeals";
import { storageConnected } from "@/server/storage";
import { PAGE_SIZE, queryPeople } from "@/server/people";
import { RememberRecent } from "@/components/SearchBox";
import { normalizeOffer, paPrefill } from "@/lib/offer";

const BACK: Record<string, [string, string]> = { tasks: ["/tasks", "Tasks"], people: ["/people", "People"], pipeline: ["/pipeline", "Pipeline"] };

export const dynamic = "force-dynamic";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; back?: string; pos?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  let [backHref, backLabel] = BACK[sp.from ?? ""] ?? BACK.people;
  // Opened from a People list: Back returns to that list (same page and sort), and Prev / Next step through it.
  let nav: { prev: string | null; next: string | null; at: number; total: number } | null = null;
  if (sp.back !== undefined) {
    const bq = new URLSearchParams(sp.back);
    const { current, shown } = await queryPeople({ list: bq.get("list") ?? undefined, f: bq.get("f") ?? undefined, q: bq.get("q") ?? undefined, sort: bq.get("sort") ?? undefined });
    const at = shown.findIndex((r) => r.id === id);
    const withPage = (i: number) => { const q = new URLSearchParams(bq); const pg = Math.floor(Math.max(0, i) / PAGE_SIZE) + 1; if (pg > 1) q.set("page", String(pg)); else q.delete("page"); return q.toString(); };
    const link = (i: number) => (i >= 0 && i < shown.length ? `/people/${shown[i].id}?back=${encodeURIComponent(withPage(i))}&pos=${i}` : null);
    if (at >= 0) {
      nav = { prev: link(at - 1), next: link(at + 1), at: at + 1, total: shown.length };
      backHref = `/people${withPage(at) ? `?${withPage(at)}` : ""}`;
    } else {
      // They no longer match the list (e.g. just texted, so not "due"): keep going from where they were.
      const was = Math.min(Math.max(0, Number(sp.pos) || 0), shown.length);
      nav = shown.length ? { prev: link(was - 1), next: link(was), at: 0, total: shown.length } : null;
      backHref = `/people${withPage(was) ? `?${withPage(was)}` : ""}`;
    }
    backLabel = current?.name ?? (bq.get("f") || bq.get("q") ? "People" : "All people");
  }
  const user = await requireUser();
  // Mark pending / Mark closed follow the Pipeline board's Under Contract columns.
  const pendingAt = pendingKeys(await db.pipelineStatus.findMany({ where: { kind: "uc" }, orderBy: { position: "asc" }, select: { untilDate: true } }));
  const [p, options, tasks, fields, files, statuses, contracts, buyerForm, sellerForm, checklists, templates] = await Promise.all([
    db.person.findFirst({
      where: { id, deletedAt: null },
      include: {
        stage: true, source: true, assignedTo: { select: { id: true, name: true } },
        phones: { orderBy: { position: "asc" } }, emails: { orderBy: { position: "asc" } }, addresses: { orderBy: { position: "asc" } },
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
  const [appts, buyerFileForm, listingFileForm, taskLists, emailTemplates, gmail] = await Promise.all([loadPersonAppointments(id, p.name), loadFileForm("buyer"), loadFileForm("listing"),
    db.taskList.findMany({ where: { builtin: null }, orderBy: { position: "asc" } }),
    db.messageTemplate.findMany({ where: { kind: "email" }, orderBy: [{ folder: "asc" }, { name: "asc" }], select: { id: true, name: true, folder: true } }), emailConnection(user.id)]);
  const fileForms = { buyer: buyerFileForm, listing: listingFileForm };
  // Offers submitted from HQ (Submit offer), newest first, with what they fill in on the purchase agreement.
  const offers = (await db.offer.findMany({ where: { personId: id, deletedAt: null }, orderBy: { createdAt: "desc" } })).map((o) => {
    const d = normalizeOffer(o.data);
    return { id: o.id, fileId: o.fileId, createdAt: o.createdAt.toISOString(), address: d.propertyAddress ?? "", price: d.purchasePrice, summary: o.summary, prefill: paPrefill(d) };
  });
  // Mass emails show whether they were opened (tracked for mass emails only).
  const recordings = new Map((await db.phoneCall.findMany({ where: { personId: p.id, entryId: { not: null }, recordingSid: { not: null } }, select: { id: true, entryId: true } })).map((c) => [c.entryId!, `/api/calls/${c.id}/audio`] as const));
  const opens = new Map((await db.emailTrack.findMany({ where: { personId: p.id, entryId: { not: null } }, select: { entryId: true, openedAt: true } })).map((t) => [t.entryId!, t.openedAt ? t.openedAt.toISOString() : null] as const));
  // Scheduled texts not yet sent, and ones that failed in the last week (owner request 2026-10-28).
  const scheduled = await loadScheduledFor(p.id, user.id, hasPermission(user.permissions, "deleteRecords"));
  const composer = await textComposerFor(user, p.tags.some((t) => t.tag.name === TEXT_STOP_TAG) ? p.name : null);
  const textPhones = p.phones.filter((x) => x.normalized.length === 10);
  // Send text starts with every number on the contact (each removable, owner 2026-10-28) and, with group texting on,
  // the owner's cell (owner 2026-10-22).
  const autoExtras = composer.groupsOn && composer.ownerCell && !textPhones.some((x) => x.normalized === composer.ownerCell!.value) ? [composer.ownerCell] : [];
  const textProps = { ...composer, phones: textPhones.map((x) => x.normalized), phoneLabels: Object.fromEntries(textPhones.map((x) => [x.normalized, x.label && !/^(mobile|cell|home|work|other|main|phone)$/i.test(x.label.trim()) ? x.label : p.name])), autoExtras };
  const emailProps = { emails: p.emails.map((e) => e.address), sendsFrom: gmail?.email ?? null, ownGmail: !!gmail && (gmail.id.startsWith("gmail:") || gmail.userId === user.id || gmail.email.toLowerCase() === user.email?.toLowerCase()), canConnect: googleKeysSet(), templates: emailTemplates.map((t) => ({ id: t.id, name: t.folder ? `${t.folder} · ${t.name}` : t.name })) };
  // A partner (lender, title, other agent) sees the deals they were picked for.
  const partnerDeals = await db.paPartner.findMany({ where: { personId: p.id, pa: { deletedAt: null, file: { deletedAt: null } } }, include: { pa: { include: { file: { include: { person: { select: { id: true, name: true } } } } } } }, orderBy: { pa: { createdAt: "desc" } } });
  const docs = await db.document.findMany({ where: { personId: id, deletedAt: null }, orderBy: { createdAt: "desc" } });

  const birthdays = p.dates.filter((d) => d.kind === "birthday").map((d) => ({ whose: d.whose, date: isoFromDate(d.date) }));
  const home = p.dates.find((d) => d.kind === "homeiversary");

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-3">
      <RememberRecent id={p.id} name={p.name} detail={p.phones[0]?.number ?? p.emails[0]?.address ?? ""} stage={p.stage?.name ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        <Link href={backHref} className="link text-sm">← {backLabel}</Link>
        {sp.from === "tasks" && <TaskTrail id={p.id} />}
        {nav && (
          <nav aria-label="Step through the list" className="ml-auto flex items-center gap-2 text-sm">
            {nav.prev ? <Link className="btn px-2.5 py-1" href={nav.prev} rel="prev">‹ Prev</Link> : <span className="btn px-2.5 py-1 opacity-40">‹ Prev</span>}
            <span className="muted">{nav.at ? `${nav.at.toLocaleString()} of ${nav.total.toLocaleString()}` : `No longer in this list · ${nav.total.toLocaleString()} left`}</span>
            {nav.next ? <Link className="btn px-2.5 py-1" href={nav.next} rel="next">Next ›</Link> : <span className="btn px-2.5 py-1 opacity-40">Next ›</span>}
          </nav>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 items-start gap-3 lg:grid-cols-[290px_minmax(0,1fr)_300px]">
        {/* On a phone: contact info, then Tasks, then Timeline, then the other cards (SPEC.md §17). */}
        <div className="contents lg:sticky lg:top-3 lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
          <div className="order-1 min-w-0">
            <InfoCard id={p.id} name={p.name} lastContactDays={daysAgo(p.lastContactAt)}
              addresses={p.addresses.length ? p.addresses.map((x) => ({ label: x.label, value: x.value, mailing: x.mailing })) : p.address ? [{ label: "", value: p.address, mailing: false }] : []}
              phones={p.phones.map((x) => ({ label: x.label, value: x.number }))} emails={p.emails.map((x) => ({ label: x.label, value: x.address }))} />
          </div>
          <div className="order-4 flex min-w-0 flex-col gap-3">
            <DetailsCard id={p.id} options={options} stageId={p.stageId} sourceId={p.sourceId} assignedToId={p.assignedToId}
              followUpDays={p.followUpDays} mailingName={p.mailingName ?? ""} referredBy={p.referredBy ?? ""} partnerType={p.partnerType} company={p.company ?? ""} kids={p.kids ?? ""} />
            {partnerDeals.length > 0 && <PartnerDeals deals={partnerDeals.map((d) => ({
              personId: d.pa.file.person.id, client: d.pa.file.person.name, address: d.pa.address, state: d.pa.state,
              role: (d.pa.side === "seller" ? sellerForm : buyerForm).find((s) => s.id === d.sectionId)?.name ?? d.sectionId,
            }))} />}
            <CustomFieldsCard id={p.id} fields={fields.map((f) => ({ fieldId: f.id, name: f.name, type: f.type, options: f.options, value: p.customValues.find((v) => v.fieldId === f.id)?.value ?? "" }))} />
            <TagsCard id={p.id} tags={p.tags.map((t) => t.tag.name).sort()} allTags={options.tags} />
            <DatesCard id={p.id} name={p.name} birthdays={birthdays} homeiversary={home ? isoFromDate(home.date) : ""} />
            {hasPermission(user.permissions, "deleteRecords") && <DeletePerson id={p.id} name={p.name} />}
          </div>
        </div>

        <section className="order-3 min-w-0 lg:order-2">
          <FileTabs scheduled={scheduled} offers={offers} email={emailProps} text={textProps} fileForms={fileForms} personId={p.id} personName={p.name} files={files} statuses={fileStatuses} canSeeCommission={canSeeCommission}
            canDelete={hasPermission(user.permissions, "deleteRecords")} contracts={contracts} forms={{ buyer: buyerForm, seller: sellerForm }} pendingAt={pendingAt} today={tasks.today} checklists={checklists} team={tasks.team} timeline={<Timeline personId={p.id} personName={p.name} team={tasks.team.map((m) => ({ id: m.id, name: m.name }))} entries={p.timeline.map((e) => ({ id: e.id, kind: e.kind, body: e.body, outcome: e.outcome, author: e.author?.name ?? null, at: e.createdAt.toISOString(), opened: opens.get(e.id), audio: recordings.get(e.id), editable: canEditEntry(e) && (e.authorId === user.id || hasPermission(user.permissions, "deleteRecords")) }))}
            email={emailProps} text={textProps} />} />
        </section>

        <aside className="order-2 flex min-w-0 flex-col gap-3 lg:sticky lg:top-3 lg:order-3">
          <TasksCard lists={taskLists.map((l) => ({ id: l.id, name: l.name, builtin: null, showOnToday: l.showOnToday }))} personId={p.id} personName={p.name} rows={tasks.rows} team={tasks.team} today={tasks.today} meId={user.id}
            templates={templates.map((t) => ({ id: t.id, name: t.name, manual: !t.trigger }))} files={files.filter((f) => !f.closedAt).map((f) => ({ id: f.id, label: `${f.kind === "buyer" ? "Buyer" : "Seller"} · ${f.kind === "buyer" ? f.status : (f.address ?? "").split(",")[0]}` }))} />
          <PipelineCard fileForms={fileForms} personId={p.id} personName={p.name} files={files} contracts={contracts} statuses={fileStatuses} canSeeCommission={canSeeCommission} />
          <AppointmentsCard types={await loadApptTypes()} calendarConnected={!!(await calendarConnection())} fileForms={fileForms} personId={p.id} personName={p.name} appts={appts} today={tasks.today} phone={p.phones[0]?.number ?? ""} address={p.address ?? ""} hasEmail={p.emails.length > 0} clientEmails={p.emails.map((e) => ({ address: e.address, label: e.label }))}
            team={tasks.team.map((m) => m.name)} callTemplates={templates.filter((t) => ["phonecall", "buyerconsult", "sellerconsult", "anyconsult"].includes(t.trigger ?? "")).map((t) => ({ name: t.name, trigger: t.trigger!, steps: t.phases.reduce((n, ph) => n + ph.steps.length, 0) }))}
            activeKinds={files.filter((f) => !f.closedAt).map((f) => f.kind)} statuses={fileStatuses} canSeeCommission={canSeeCommission} />
          <FilesCard personId={p.id} connected={storageConnected()} isAdmin={hasPermission(user.permissions, "manageUsers")}
            docs={docs.map((d) => ({ id: d.id, name: d.name, size: d.size, date: d.createdAt.toISOString().slice(0, 10) }))} />
        </aside>
      </div>
    </div>
  );
}
