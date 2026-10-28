"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { factRows, fileLine, money, shortDay, type FileSection, type FileView } from "@/lib/files";

const pick = (o: Record<string, string>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));
import type { StatusRow } from "@/server/files";
import { FileForm } from "../../pipeline/FileForm";
import { deleteFile, setFileStatus } from "../../pipeline/actions";
import { PaWizard } from "../../pipeline/PaWizard";
import { PaBox } from "./PaBox";
import type { PaSection, PaView, Side } from "@/lib/pa";
import { dealEmails } from "@/lib/partners";
import type { TaskRow, TeamMember } from "@/server/tasks";
import { Checklist } from "./Checklist";
import { EmailComposer } from "./EmailComposer";
import { TextComposer } from "@/components/TextComposer";
import { OfferModal } from "./OfferModal";
import { DealNotes } from "./DealNotes";

type EmailProps = { emails: string[]; templates: { id: string; name: string }[]; sendsFrom: string | null; ownGmail?: boolean; canConnect?: boolean };
export type OfferRow = { id: string; fileId: string; createdAt: string; address: string; price: number | null; summary: string; prefill: Record<string, string> };
type Props = { offers: OfferRow[]; email: EmailProps; text: Omit<React.ComponentProps<typeof TextComposer>, "personId">; fileForms: Record<"buyer" | "listing", FileSection[]>; personId: string; personName: string; files: FileView[]; statuses: Record<"buyer" | "listing", StatusRow[]>; canSeeCommission: boolean; canDelete: boolean; timeline: React.ReactNode;
  contracts: PaView[]; forms: Record<Side, PaSection[]>; today: string; checklists: TaskRow[]; team: TeamMember[] };

/** Middle column: a tab per active buyer/listing file, then Timeline (SPEC.md §6.3). */
export function FileTabs(p: Props) {
  const active = p.files.filter((f) => !f.closedAt);
  const [tab, setTab] = useState(active[0]?.id ?? "timeline");
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
      {current ? <FilePane key={current.id} {...p} file={current} onDeleted={() => setTab("timeline")} /> : p.timeline}
    </>
  );
}

export function SideChip({ kind }: { kind: string }) {
  return <span className={`rounded px-1.5 text-[11px] font-bold uppercase tracking-wide ${kind === "buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{kind === "buyer" ? "Buyer" : kind === "listing" ? "Seller" : kind}</span>;
}

function FilePane({ offers, email, text, fileForms, file, personId, personName, statuses, canSeeCommission, canDelete, onDeleted, contracts, forms, today, checklists, team }: Props & { file: FileView; onDeleted: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addingPa, setAddingPa] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [texting, setTexting] = useState(false);
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
  const facts = factRows(fileForms[file.kind], file);
  const answers = { ...file.info, address: file.address ?? "", price: file.price ? String(file.price) : "", ...(file.commission !== null ? { commission: file.commission } : {}), ...(file.bac !== null ? { bac: file.bac } : {}) };

  return (
    <div className="card mt-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b>{file.kind === "buyer" ? "Buyer" : "Seller"}</b> <span className="muted">{activePa ? activePa.address : fileLine(file)}</span>
          <p className="text-xs muted">{activePa ? `Under contract${activePa.dates.closing ? ` · closing ${shortDay(activePa.dates.closing)}` : ""}` : `In ${file.status} since ${shortDay(file.statusSince.slice(0, 10))}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {file.kind === "buyer" && !activePa && <button type="button" className="btn" onClick={() => setOffering(true)}>Submit offer</button>}
          <button type="button" className="btn" aria-expanded={texting} onClick={() => { setTexting((x) => !x); setEmailing(false); }}>Send text</button>
          <button type="button" className="btn" aria-expanded={emailing} onClick={() => { setEmailing((x) => !x); setTexting(false); }}>Send email</button>
          <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
          {canDelete && <button type="button" className="btn btn-danger" disabled={pending} onBlur={() => setConfirm(false)}
            onClick={() => confirm ? run(() => deleteFile(file.id), onDeleted) : setConfirm(true)}>{confirm ? "Click again to delete" : "Delete"}</button>}
          {activePa ? <span className="rounded-full bg-[#f6e3d9] px-3 py-1 text-sm font-semibold text-[#9a4f2e]">Under contract</span> : <label className="flex items-center gap-1.5 text-sm font-semibold">Status
            <select className="input w-auto" value={file.statusId ?? ""} disabled={pending}
              onChange={(e) => { const to = e.target.value; run(() => setFileStatus({ id: file.id, statusId: to }), () => setMsg(`Moved to ${list.find((s) => s.id === to)?.name}.`)); }}>
              {!file.statusId && <option value="">No status</option>}
              {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>}
        </div>
      </div>
      {/* Email opens right here on the deal, so the checklist stays in view while writing. */}
      {emailing && (
        <div className="mt-3 rounded-lg border border-misty bg-paper p-3">
          <div className="flex items-center justify-between"><b className="text-sm">Email {personName}</b>
            <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setEmailing(false)}>Close</button></div>
          <EmailComposer personId={personId} emails={email.emails} templates={email.templates} sendsFrom={email.sendsFrom} ownGmail={email.ownGmail} canConnect={email.canConnect} onSent={() => setEmailing(false)} suggest={activePa ? dealEmails(forms[activePa.side], activePa) : []} />
        </div>
      )}
      {texting && (
        <div className="mt-3 rounded-lg border border-misty bg-paper p-3">
          <div className="flex items-center justify-between"><b className="text-sm">Text {personName}</b>
            <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setTexting(false)}>Close</button></div>
          <TextComposer personId={personId} {...text} onSent={(name) => { setTexting(false); setMsg(`Text sent to ${name}.`); }} />
        </div>
      )}
      <DealNotes key={file.id + file.notes} fileId={file.id} notes={file.notes} notesAt={file.notesAt} notesBy={file.notesBy} />
      {facts.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
      )}
      {facts.length === 0 && <p className="mt-3 text-sm muted">Nothing filled in yet. Use Edit to add details.</p>}
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
        <PaBox pa={activePa} personName={personName} fileKind={file.kind} fileLine={fileLine(file)} forms={forms} today={today} canSeeCommission={canSeeCommission}>
          <Checklist title={activePa.side === "buyer" ? "Buyer contract checklist" : "Seller contract checklist"} tasks={checklists.filter((t) => t.paId === activePa.id)} today={today} team={team} personId={personId} />
        </PaBox>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-misty px-3 py-2.5">
          <span><b>Offer accepted?</b> <span className="text-sm muted">Add the purchase agreement to put {personName.split(" ")[0]} under contract{myOffers.length ? "; it starts filled in from the latest offer" : ""}.</span></span>
          <button type="button" className="btn btn-primary" onClick={() => setAddingPa(true)}>+ Add purchase agreement</button>
        </div>
      )}
      <Checklist title={file.kind === "buyer" ? "Buyer checklist" : "Seller checklist"} tasks={checklists.filter((t) => t.fileId === file.id && !t.paId)} today={today} team={team} personId={personId} />
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
