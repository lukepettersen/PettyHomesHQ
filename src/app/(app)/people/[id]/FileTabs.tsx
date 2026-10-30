"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { COMPOSE_EVENT, type ComposeRequest } from "./compose";
import { cancelScheduledText } from "../../messages/actions";
import { cancelScheduledEmail } from "../emailActions";
import { factRows, fileLine, money, shortDay, type FileSection, type FileView } from "@/lib/files";

const pick = (o: Record<string, string>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));
import type { StatusRow } from "@/server/files";
import { FileForm } from "../../pipeline/FileForm";
import { deleteFile, setFileStatus } from "../../pipeline/actions";
import { PaWizard } from "../../pipeline/PaWizard";
import { DateStrip, FactGrid, nextKeyDate, paFacts, PaButtons, paPeople, PeopleList } from "./PaBox";
import { useDropdown } from "@/components/useDropdown";
import { isPending, ucColumn, type DateKey, type PaSection, type PaView, type Side } from "@/lib/pa";
import { dealEmails } from "@/lib/partners";
import type { TaskRow, TeamMember } from "@/server/tasks";
import { Checklist } from "./Checklist";
import { EmailComposer } from "./EmailComposer";
import { TextComposer } from "@/components/TextComposer";
import { OfferModal } from "./OfferModal";
import { DealNotes } from "./DealNotes";
import { SocialPosts } from "./SocialPosts";

type EmailProps = { emails: string[]; templates: { id: string; name: string }[]; sendsFrom: string | null; ownGmail?: boolean; canConnect?: boolean };
export type OfferRow = { id: string; fileId: string; createdAt: string; address: string; price: number | null; summary: string; prefill: Record<string, string> };
type Props = { offers: OfferRow[]; email: EmailProps; text: Omit<React.ComponentProps<typeof TextComposer>, "personId">; fileForms: Record<"buyer" | "listing", FileSection[]>; personId: string; personName: string; files: FileView[]; statuses: Record<"buyer" | "listing", StatusRow[]>; canSeeCommission: boolean; canDelete: boolean; timeline: React.ReactNode;
  contracts: PaView[]; forms: Record<Side, PaSection[]>; pendingAt: DateKey[]; ucColumns: { name: string; untilDate: string | null }[]; today: string; checklists: TaskRow[]; team: TeamMember[]; scheduled: ScheduledRow[] };
export type ScheduledRow = { id: string; when: string; to: string; body: string; by: string; mine: boolean; status: string; error: string | null; personId?: string | null; auto?: boolean; email?: boolean };

/** Middle column: a tab per active buyer/listing file, then Timeline (SPEC.md §6.3). */
export function FileTabs(p: Props) {
  const active = p.files.filter((f) => !f.closedAt);
  const [tab, setTab] = useState(active[0]?.id ?? "timeline");
  // Text / Email open here, above whichever tab is showing; the same button again closes it (owner request 2026-10-28).
  const [compose, setCompose] = useState<(ComposeRequest & { n: number }) | null>(null);
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<ComposeRequest>).detail;
      setCompose((cur) => (cur && cur.kind === d.kind && !d.subject ? null : { ...d, n: (cur?.n ?? 0) + 1 }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(COMPOSE_EVENT, on);
    // Text / Email from a People list row (?compose=text|email) opens the composer straight away.
    const want = new URLSearchParams(window.location.search).get("compose");
    const t = want === "text" || want === "email" ? setTimeout(() => setCompose({ kind: want === "text" ? "send" : "email", n: 1 }), 0) : undefined;
    return () => { window.removeEventListener(COMPOSE_EVENT, on); clearTimeout(t); };
  }, []);
  // A file that was just started opens in its own tab.
  const ids = active.map((f) => f.id).join(",");
  const [known, setKnown] = useState(ids);
  if (ids !== known) {
    const fresh = active.find((f) => !known.split(",").includes(f.id));
    setKnown(ids);
    if (fresh) setTab(fresh.id);
  }
  const current = active.find((f) => f.id === tab);
  const shown = current ? current.id : "timeline";
  return (
    <>
      {/* Its own section at the top (owner request 2026-10-30): anything set to send later, from a deal or not. */}
      <Scheduled rows={p.scheduled} />
      <div role="tablist" aria-label="Files and timeline" className="flex gap-1 overflow-x-auto border-b border-misty">
        {active.map((f) => (
          <button key={f.id} role="tab" type="button" aria-selected={shown === f.id} onClick={() => setTab(f.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-[3px] px-3 py-2 whitespace-nowrap ${shown === f.id ? "border-coral font-semibold" : "border-transparent muted hover:text-charcoal"}`}>
            <SideChip kind={f.kind} /> {f.kind === "buyer" ? (p.contracts.find((c) => c.fileId === f.id && c.state === "active")?.address.split(",")[0] ?? f.status) : (f.address ?? "Listing").split(",")[0]}
          </button>
        ))}
        <button role="tab" type="button" aria-selected={shown === "timeline"} onClick={() => setTab("timeline")}
          className={`-mb-px border-b-[3px] px-3 py-2 ${shown === "timeline" ? "border-coral font-semibold" : "border-transparent muted hover:text-charcoal"}`}>Timeline</button>
      </div>
      {compose && (
        <div className="card mt-3 p-4">
          <div className="flex items-center justify-between"><b className="text-sm">{compose.kind === "send" ? "Text" : "Email"} {p.personName}</b>
            <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setCompose(null)}>Close</button></div>
          {compose.kind === "send"
            ? <TextComposer personId={p.personId} {...p.text} onSent={() => undefined} />
            : <EmailComposer key={compose.n} personId={p.personId} emails={p.email.emails} templates={p.email.templates} sendsFrom={p.email.sendsFrom} ownGmail={p.email.ownGmail} canConnect={p.email.canConnect}
                initialSubject={compose.subject ?? ""} onSent={() => setCompose(null)} suggest={(() => { const pa = current && p.contracts.find((c) => c.fileId === current.id && c.state === "active"); return pa ? dealEmails(p.forms[pa.side], pa) : []; })()} />}
        </div>
      )}
      {current ? <FilePane key={current.id} {...p} file={current} onDeleted={() => setTab("timeline")} /> : p.timeline}
    </>
  );
}

export function SideChip({ kind }: { kind: string }) {
  return <span className={`rounded px-1.5 text-[11px] font-bold uppercase tracking-wide ${kind === "buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{kind === "buyer" ? "Buyer" : kind === "listing" ? "Seller" : kind}</span>;
}

function FilePane({ offers, email, text, fileForms, file, personId, personName, statuses, canSeeCommission, canDelete, onDeleted, contracts, forms, pendingAt, ucColumns, today, checklists, team }: Props & { file: FileView; onDeleted: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addingPa, setAddingPa] = useState(false);
  const [editingPa, setEditingPa] = useState(false);
  const { open: moreOpen, setOpen: setMoreOpen, ref: moreRef } = useDropdown<HTMLSpanElement>();
  const [offering, setOffering] = useState(false);
  const [viewOffer, setViewOffer] = useState<string | null>(null);
  const myOffers = offers.filter((o) => o.fileId === file.id);
  const mine = contracts.filter((c) => c.fileId === file.id);
  const activePa = mine.find((c) => c.state === "active");
  const earlier = mine.filter((c) => c.state !== "active");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const list = statuses[file.kind];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => start(async () => {
    setError(""); const r = await fn();
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    done?.(); router.refresh();
  });
  const facts = factRows(fileForms[file.kind], file, { blanks: true });
  // The Coming Soon/Active post shows from the first "Coming soon…" stage on (owner 2026-10-29).
  const csAt = list.findIndex((x) => /coming soon/i.test(x.name));
  const comingSoonYet = csAt < 0 || list.findIndex((x) => x.id === file.statusId) >= csAt;
  const answers = { ...file.info, address: file.address ?? "", price: file.price ? String(file.price) : "", ...(file.commission !== null ? { commission: file.commission } : {}), ...(file.bac !== null ? { bac: file.bac } : {}) };

  const pend = activePa ? isPending(activePa, pendingAt, today) : false;
  const next = activePa ? nextKeyDate(activePa, today) : null;
  // One header for the deal (owner-approved layout 2026-10-28): the address, price and status show once.
  const fullAddress = activePa ? activePa.address : file.kind === "listing" ? file.address ?? "" : "";
  const [street, ...rest] = fullAddress.split(",");
  const title = street?.trim() || fileLine(file);
  const price = activePa ? activePa.price : file.price;
  // The price is in the header, so Notes leaves it out.
  const notesFacts = (activePa ? paFacts(activePa, forms) : facts).filter(([k]) => !/^(list )?price$/i.test(k));
  const people = activePa ? paPeople(activePa, forms) : [];

  return (
    <div className="card mt-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SideChip kind={file.kind} />
          <h2 className="mt-1 text-xl font-extrabold leading-tight">{title}</h2>
          {(rest.length > 0 || price) && <p className="text-sm muted">{rest.join(",").trim()}{rest.length > 0 && price ? " · " : ""}{price ? <b className="text-charcoal">{money(price)}</b> : null}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {activePa
              ? <span className={`rounded-full px-3 py-0.5 font-semibold ${pend ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{pend ? "Pending" : "Under contract"}</span>
              : <select aria-label="Status" className="w-auto rounded-full border border-misty bg-sunken py-0.5 pl-3 pr-7 font-semibold" value={file.statusId ?? ""} disabled={pending}
                  onChange={(e) => { const to = e.target.value; run(() => setFileStatus({ id: file.id, statusId: to }), () => setMsg(`Moved to ${list.find((x) => x.id === to)?.name}.`)); }}>
                  {!file.statusId && <option value="">No status</option>}
                  {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>}
            <span className="muted">{activePa
              ? next ? <>Next: <b className="text-charcoal">{next.label} {shortDay(next.date)}</b> ({next.when})</> : activePa.dates.closing ? <>Closing <b className="text-charcoal">{shortDay(activePa.dates.closing)}</b></> : null
              : `Since ${shortDay(file.statusSince.slice(0, 10))}`}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activePa && <PaButtons pa={activePa} personName={personName} pendingAt={pendingAt} today={today} onMsg={setMsg} onError={setError} />}
          {file.kind === "buyer" && !activePa && <button type="button" className="btn btn-primary" onClick={() => setOffering(true)}>Submit offer</button>}
          <span ref={moreRef} className="relative">
            <button type="button" className="btn border-transparent muted" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>More ▾</button>
            {moreOpen && (
              <span role="menu" className="absolute right-0 top-full z-20 mt-1 flex w-48 flex-col rounded-lg border border-misty bg-white p-1 shadow-xl">
                {activePa && <button type="button" role="menuitem" className="rounded px-2.5 py-1.5 text-left text-sm hover:bg-sunken" onClick={() => { setMoreOpen(false); setEditingPa(true); }}>Edit contract</button>}
                <button type="button" role="menuitem" className="rounded px-2.5 py-1.5 text-left text-sm hover:bg-sunken" onClick={() => { setMoreOpen(false); setEditing(true); }}>Edit {file.kind === "buyer" ? "buyer" : "seller"} file</button>
                {canDelete && <button type="button" role="menuitem" className="rounded px-2.5 py-1.5 text-left text-sm text-bad hover:bg-sunken" disabled={pending} onBlur={() => setConfirm(false)}
                  onClick={() => confirm ? run(() => deleteFile(file.id), onDeleted) : setConfirm(true)}>{confirm ? "Click again to delete" : "Delete"}</button>}
              </span>
            )}
          </span>
        </div>
      </div>
      {activePa && <DateStrip pa={activePa} today={today} />}
      <div className={`mt-4 grid gap-3 ${people.length ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
        <section aria-label="Notes" className="rounded-xl border border-misty bg-paper px-3.5 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider muted">Notes</h3>
          {notesFacts.length > 0 && <FactGrid facts={notesFacts} />}
          <DealNotes key={file.id + file.notes} fileId={file.id} notes={file.notes} notesAt={file.notesAt} notesBy={file.notesBy} />
          <SocialPosts fileId={file.id} kind={file.kind} posts={file.social} address={file.address} price={file.price} underContract={!!activePa} comingSoon={comingSoonYet} />
        </section>
        {people.length > 0 && (
          <section aria-label="People" className="rounded-xl border border-misty bg-paper px-3.5 py-2.5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider muted">People</h3>
            <PeopleList people={people} />
          </section>
        )}
      </div>
      {myOffers.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider muted">Offers submitted</h4>
          {myOffers.map((o) => (
            <div key={o.id} className="border-t border-misty/60 py-1.5 text-sm first:border-0">
              <button type="button" className="flex w-full justify-between gap-2 text-left hover:underline" aria-expanded={viewOffer === o.id} onClick={() => setViewOffer(viewOffer === o.id ? null : o.id)}>
                <span>{o.address.split(",")[0] || "Offer"}{o.price != null ? ` · ${money(o.price)}` : ""}</span><span className="muted">{shortDay(o.createdAt.slice(0, 10))} · {viewOffer === o.id ? "Hide" : "View"}</span>
              </button>
              {viewOffer === o.id && <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-2 font-mono text-xs">{o.summary}</pre>}
            </div>
          ))}
        </div>
      )}
      {activePa ? (
        <div className="mt-2"><Checklist title={`Contract to Close${(() => { const col = ucColumn(ucColumns, activePa, today); return col ? ` · ${col.name}` : ""; })()}`} tasks={checklists.filter((t) => t.paId === activePa.id)} today={today} team={team} personId={personId} /></div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-misty px-3 py-2.5">
          <span><b>Offer accepted?</b> <span className="text-sm muted">Add the purchase agreement to put {personName.split(" ")[0]} under contract{myOffers.length ? "; it starts filled in from the latest offer" : ""}.</span></span>
          <button type="button" className="btn btn-primary" onClick={() => setAddingPa(true)}>+ Add purchase agreement</button>
        </div>
      )}
      <Checklist title={file.kind === "buyer" ? "Buyer checklist" : "Seller checklist"} tasks={checklists.filter((t) => t.fileId === file.id && !t.paId)} today={today} team={team} personId={personId} hideEmpty={!!activePa} />
      {earlier.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider muted">Earlier contracts</h4>
          {earlier.map((c) => (
            <div key={c.id} className="flex justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
              <span>{c.address.split(",")[0]} · {money(c.price)}</span>
              <span className="muted">{c.state === "closed" ? "Closed" : "Fell through"}{c.endedOn ? ` ${shortDay(c.endedOn)}` : ""}</span>
            </div>
          ))}
        </div>
      )}
      {addingPa && (
        <PaWizard fileId={file.id} fileKind={file.kind} personName={personName} fileLine={fileLine(file)} forms={forms} canSeeCommission={canSeeCommission}
          prefill={file.kind === "listing" ? { address: file.address ?? "", price: file.price ? String(file.price) : "", ...pick(file.info, ["ptype", "year", "hoa", "newc"]) } : myOffers[0]?.prefill ?? {}}
          onClose={() => setAddingPa(false)} onSaved={(m) => { setAddingPa(false); setMsg(m); router.refresh(); }} />
      )}
      {editingPa && activePa && (
        <PaWizard fileId={activePa.fileId} fileKind={file.kind} personName={personName} fileLine={fileLine(file)} pa={activePa} forms={forms} canSeeCommission={canSeeCommission}
          onClose={() => setEditingPa(false)} onSaved={(m) => { setEditingPa(false); setMsg(m); router.refresh(); }} />
      )}
      {offering && <OfferModal personId={personId} personName={personName} buyerFiles={[{ id: file.id, label: fileLine(file) }]} fileId={file.id} onClose={() => setOffering(false)} />}
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {editing && (
        <FileForm form={fileForms[file.kind]} kind={file.kind} personId={personId} personName={personName} fileId={file.id} statuses={list} statusId={file.statusId} answers={answers}
          canSeeCommission={canSeeCommission} onClose={() => setEditing(false)} onSaved={(m) => { setEditing(false); setMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

/** Texts and emails scheduled for this person that haven't gone out (or didn't send), and checklist steps that send by
 *  themselves, with Cancel / Turn off (owner requests 2026-10-28, 10-29). */
function Scheduled({ rows }: { rows: ScheduledRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const [full, setFull] = useState<string[]>([]); // texts opened to read in full (owner request 2026-10-28)
  if (!rows.length) return null;
  return (
    <section aria-label="Scheduled" className="card mb-3 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider muted">{rows.some((x) => x.auto || x.email) ? "Scheduled texts & emails" : "Scheduled texts"}</h3>
      <ul className="mt-1 flex flex-col">
        {rows.map((x) => (
          <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-misty/60 py-1.5 text-sm first:border-0">
            <span className="min-w-0 flex-1">
              <b>{x.status === "failed" ? "Not sent" : x.when}</b> <span className="muted">to {x.to} · by {x.by}</span>
              <button type="button" aria-expanded={full.includes(x.id)} title={full.includes(x.id) ? "Show less" : "Show the whole text"} onClick={() => setFull(full.includes(x.id) ? full.filter((y) => y !== x.id) : [...full, x.id])}
                className={`block w-full text-left hover:text-accent ${full.includes(x.id) ? "whitespace-pre-wrap break-words" : "truncate"}`}>{x.body}</button>
              {x.error && <span className="block text-xs text-bad">{x.when}: {x.error}</span>}
            </span>
            {x.status === "pending" && x.mine && <button type="button" className="text-xs font-semibold text-bad hover:underline" disabled={busy}
              onClick={() => start(async () => { setError(""); const r = x.id.startsWith("email:") ? await cancelScheduledEmail(x.id.slice(6)) : await cancelScheduledText(x.id); if (!r.ok) setError(r.error); else router.refresh(); })}>{x.auto ? "Turn off" : "Cancel"}</button>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
  );
}
