"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { initials } from "@/lib/normalize";
import { fileLine, health, HEALTH_LABEL, kMoney, shortDay } from "@/lib/files";
import { diffDays } from "@/lib/tasks";
import type { ContractCard, PipelineCard, StatusRow } from "@/server/files";
import { StageEditor } from "./StageEditor";

type Tab = "buyers" | "sellers" | "uc";
const BAR = ["bg-misty", "bg-mint", "bg-moss"];

/** Read-only overview of where each client is (SPEC.md §7.3). Status changes happen on the client's page. */
export function PipelineBoard({ cards, contracts, closed, statuses, today, initialTab, canEditStages }: { cards: PipelineCard[]; contracts: ContractCard[]; closed: ContractCard[]; statuses: Record<"buyer" | "listing" | "uc", StatusRow[]>; today: string; initialTab: Tab; canEditStages: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]); // columns showing all their cards ("+N more")
  useEffect(() => { window.history.replaceState(null, "", tab === "buyers" ? "/pipeline" : `/pipeline?tab=${tab}`); }, [tab]);
  const buyers = cards.filter((c) => c.kind === "buyer"), sellers = cards.filter((c) => c.kind === "listing");
  const year = today.slice(0, 4);
  const tabs: [Tab, string, number][] = [["buyers", "Buyers", buyers.length], ["sellers", "Sellers", sellers.length], ["uc", "Under Contract/Pending", contracts.length]];
  const volume = contracts.reduce((t, c) => t + c.price, 0);
  const statusKind = tab === "buyers" ? "buyer" : tab === "sellers" ? "listing" : "uc";

  type Col = { key: string; name: string; items: (PipelineCard | ContractCard)[]; closed?: boolean };
  const columns: Col[] = tab === "uc"
    ? [...statuses.uc.map((s) => ({ key: s.id, name: s.name, items: contracts.filter((c) => c.columnId === s.id) })), { key: "closed", name: `Closed in ${year}`, items: closed, closed: true }]
    : statuses[statusKind as "buyer" | "listing"].map((s) => ({ key: s.id, name: s.name, items: (tab === "buyers" ? buyers : sellers).filter((c) => c.statusId === s.id) }));
  const orphans = (tab === "buyers" ? buyers : tab === "sellers" ? sellers : []).filter((c) => !c.statusId);
  if (orphans.length) columns.unshift({ key: "none", name: "No status", items: orphans });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3"><h1 className="text-2xl font-extrabold sm:text-[28px]">Pipeline</h1><span className="text-sm muted">{volume ? kMoney(volume) : "$0"} under contract</span></div>
        {canEditStages && !editing && <button type="button" className="btn" onClick={() => setEditing(true)}>Edit stages</button>}
      </div>
      <div role="tablist" aria-label="Pipeline" className="mt-3 flex gap-1 overflow-x-auto border-b border-misty">
        {tabs.map(([k, l, n]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} disabled={editing} onClick={() => setTab(k)}
            className={`-mb-px border-b-[3px] px-3 py-2 whitespace-nowrap ${tab === k ? "border-coral font-semibold" : "border-transparent muted hover:text-charcoal"}`}>
            {l} <span className="text-xs muted">{n}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm muted">
        {tab === "uc" ? `Grouped by the next contract date still open. Closed in ${year} stays on the right all year. ` : ""}
        Shows where each client is. To change a status, open the client.
      </p>
      {editing ? (
        <StageEditor kind={statusKind} rows={statuses[statusKind]} counts={Object.fromEntries(columns.map((c) => [c.key, c.items.length]))} onDone={() => setEditing(false)} />
      ) : (
        // Option A (owner-approved 2026-10-28): every stage is a column, all sharing the width evenly (never under ~130px,
        // so it only scrolls sideways in the busiest case); 8 cards a column then "+N more".
        <div className="mt-3 flex items-start gap-1.5 overflow-x-auto pb-3">
          {columns.map((c, i) => {
            const total = c.items.reduce((t, x) => t + (x.price ?? 0), 0);
            const all = expanded.includes(c.key), shown = all ? c.items : c.items.slice(0, 8);
            return (
              <section key={c.key} aria-label={c.name} className="flex min-w-[130px] flex-1 basis-0 flex-col overflow-hidden rounded-lg border border-misty bg-sunken">
                <div className={`h-[3px] ${c.closed ? "bg-moss" : tab === "uc" ? "bg-coral" : BAR[i % 3]}`} />
                <div className="flex items-baseline justify-between gap-1 border-b border-misty bg-white px-2 py-1.5 text-[13px]"><b className="leading-tight">{c.name}</b><span className="flex-none text-xs muted">{c.items.length}{total ? ` · ${kMoney(total)}` : ""}</span></div>
                <div className="flex flex-col gap-1 p-1">
                  {shown.map((x) => "fileId" in x ? <ContractTile key={x.id} card={x} today={today} closed={!!c.closed} /> : <Card key={x.id} card={x} today={today} />)}
                  {!c.items.length && <span className="py-2 text-center text-xs muted">Empty</span>}
                  {c.items.length > 8 && <button type="button" className="py-0.5 text-xs font-semibold text-accent hover:underline" onClick={() => setExpanded(all ? expanded.filter((k) => k !== c.key) : [...expanded, c.key])}>{all ? "Show fewer" : `+${c.items.length - 8} more`}</button>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dot({ h }: { h: string }) {
  return <span title={HEALTH_LABEL[h as keyof typeof HEALTH_LABEL]} aria-label={HEALTH_LABEL[h as keyof typeof HEALTH_LABEL]} className={`mt-1 h-2 w-2 flex-none rounded-full ${h === "r" ? "bg-bad" : h === "y" ? "bg-[#d4a017]" : "bg-mint"}`} />;
}

/** The next task line with the assignees' initials: red when late. */
function Next({ n, today, assignees = [] }: { n: { title: string; due: string | null } | null; today: string; assignees?: string[] }) {
  const late = !!n?.due && n.due < today;
  return (
    <span className={`text-xs ${late ? "font-semibold text-bad" : "muted"}`}>
      {n ? `${n.title} · ${late ? shortDay(n.due!) : n.due ? shortDay(n.due) : "no date"}` : "All caught up"}
      {assignees.map((a) => <span key={a} title={a} className="ml-1 inline-grid h-4 w-4 place-items-center rounded-full bg-accent-soft align-middle text-[8px] font-bold text-accent">{initials(a)}</span>)}
    </span>
  );
}

/** A compact card: name and health dot, then (sellers) who / days on market, then the next task (owner-approved 2026-10-28). */
function Card({ card, today }: { card: PipelineCard; today: string }) {
  const title = card.kind === "buyer" ? card.personName : (card.address ?? "Listing").split(",")[0];
  const i = card.info;
  const sub = card.kind === "buyer"
    ? (i.repExpires ? `Rep expires ${shortDay(i.repExpires)}` : "")
    : [card.personName, card.status === "Active" && i.active ? `${Math.max(0, diffDays(today, i.active))} days on market` : i.photos ? `Photos ${shortDay(i.photos)}` : ""].filter(Boolean).join(" · ");
  return (
    <Link href={`/people/${card.personId}?from=pipeline`} title={card.notes ? `Deal notes: ${card.notes}` : undefined} className="flex flex-col rounded-md border border-misty bg-white px-2 py-1.5 text-[13px] leading-snug hover:border-accent">
      <span className="flex items-start justify-between gap-1.5"><b className="min-w-0 break-words">{title}</b><Dot h={health(card.overdue)} /></span>
      {sub && <span className="text-xs muted">{sub}</span>}
      <Next n={card.nextTask} today={today} assignees={card.assignees} />
    </Link>
  );
}

function ContractTile({ card, today, closed }: { card: ContractCard; today: string; closed: boolean }) {
  return (
    <Link href={`/people/${card.personId}?from=pipeline`} className="flex flex-col rounded-md border border-misty bg-white px-2 py-1.5 text-[13px] leading-snug hover:border-accent">
      <span className="flex items-start justify-between gap-1.5">
        <span className="min-w-0"><span className={`mr-1 rounded px-1 text-[9px] font-bold uppercase ${card.side === "buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{card.side === "buyer" ? "Buyer" : "Seller"}</span><b className="break-words">{card.address.split(",")[0]}</b></span>
        {!closed && <Dot h={health(card.overdue)} />}
      </span>
      <span className="text-xs muted">{card.personName} · {kMoney(card.price)}{closed ? ` · Closed ${card.endedOn ? shortDay(card.endedOn) : ""}` : card.dates.closing ? ` · Closing ${shortDay(card.dates.closing)}` : ""}</span>
      {!closed && <Next n={card.nextTask} today={today} />}
    </Link>
  );
}
