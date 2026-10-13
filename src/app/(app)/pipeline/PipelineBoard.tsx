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
        <div className="mt-3 flex gap-3 overflow-x-auto pb-3">
          {columns.map((c, i) => {
            const total = c.items.reduce((t, x) => t + (x.price ?? 0), 0);
            return (
              <section key={c.key} aria-label={c.name} className="flex w-[260px] flex-none flex-col gap-2">
                <div className="overflow-hidden rounded-lg border border-misty bg-white">
                  <div className={`h-1 ${c.closed ? "bg-moss" : tab === "uc" ? "bg-coral" : BAR[i % 3]}`} />
                  <div className="flex items-baseline justify-between px-3 py-2"><b>{c.name}</b><span className="text-xs muted">{c.items.length} · {total ? kMoney(total) : "$0"}</span></div>
                </div>
                {c.items.map((x) => "fileId" in x ? <ContractTile key={x.id} card={x} today={today} closed={!!c.closed} /> : <Card key={x.id} card={x} today={today} />)}
                {c.items.length === 0 && <div className="rounded-lg border border-dashed border-misty px-3 py-3 text-center text-sm muted">Empty</div>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ card, today }: { card: PipelineCard; today: string }) {
  const h = health(card.overdue);
  const title = card.kind === "buyer" ? card.personName : (card.address ?? "Listing").split(",")[0];
  const sub = card.kind === "buyer" ? fileLine(card) : `${card.personName}${card.price ? ` · ${kMoney(card.price)}` : ""}`;
  const i = card.info;
  const meta = card.kind === "buyer"
    ? (i.repExpires ? `Rep expires ${shortDay(i.repExpires)}` : "")
    : card.status === "Active" && i.active ? `${Math.max(0, diffDays(today, i.active))} days on market` : i.photos ? `Photos ${shortDay(i.photos)}` : "";
  const n = card.nextTask, late = !!n?.due && n.due < today;
  return (
    <Link href={`/people/${card.personId}?from=pipeline`} className="flex flex-col gap-0.5 rounded-lg border border-misty bg-white px-3 py-2.5 text-sm hover:border-accent">
      <span className="flex items-center justify-between gap-2">
        <b className="truncate">{title}</b>
        <span title={HEALTH_LABEL[h]} aria-label={HEALTH_LABEL[h]} className={`h-2.5 w-2.5 flex-none rounded-full ${h === "r" ? "bg-bad" : h === "y" ? "bg-[#d4a017]" : "bg-mint"}`} />
      </span>
      <span className="truncate text-xs muted">{sub}</span>
      {meta && <span className="text-xs muted">{meta}</span>}
      <span className={`mt-1 text-xs ${late ? "font-semibold text-bad" : ""}`}>{n ? `${n.title} · ${late ? "overdue" : n.due ? shortDay(n.due) : "no date"}` : "All caught up"}</span>
      {card.assignees.length > 0 && (
        <span className="mt-1 flex gap-1">{card.assignees.map((a) => <span key={a} title={a} className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft text-[9px] font-bold text-accent">{initials(a)}</span>)}</span>
      )}
    </Link>
  );
}

function ContractTile({ card, today, closed }: { card: ContractCard; today: string; closed: boolean }) {
  const h = health(card.overdue);
  const n = card.nextTask, late = !!n?.due && n.due < today;
  return (
    <Link href={`/people/${card.personId}?from=pipeline`} className="flex flex-col gap-0.5 rounded-lg border border-misty bg-white px-3 py-2.5 text-sm hover:border-accent">
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`rounded px-1 text-[10px] font-bold uppercase ${card.side === "buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{card.side === "buyer" ? "Buyer" : "Seller"}</span>
          <b className="truncate">{card.address.split(",")[0]}</b>
        </span>
        {!closed && <span title={HEALTH_LABEL[h]} aria-label={HEALTH_LABEL[h]} className={`h-2.5 w-2.5 flex-none rounded-full ${h === "r" ? "bg-bad" : h === "y" ? "bg-[#d4a017]" : "bg-mint"}`} />}
      </span>
      <span className="truncate text-xs muted">{card.personName} · {kMoney(card.price)}</span>
      {closed
        ? <span className="mt-1 text-xs">Closed {card.endedOn ? shortDay(card.endedOn) : ""}</span>
        : <>
            <span className="text-xs muted">{card.dates.closing ? `Closing ${shortDay(card.dates.closing)}` : "Closing date not set"}</span>
            <span className={`mt-1 text-xs ${late ? "font-semibold text-bad" : ""}`}>{n ? `${n.title} · ${late ? "overdue" : n.due ? shortDay(n.due) : "no date"}` : "All caught up"}</span>
          </>}
    </Link>
  );
}
