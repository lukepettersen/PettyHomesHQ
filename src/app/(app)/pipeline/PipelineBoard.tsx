"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTickerAction, setFileStatus } from "./actions";
import { initials } from "@/lib/normalize";
import { fileLine, health, HEALTH_LABEL, kMoney, shortDay } from "@/lib/files";
import { diffDays } from "@/lib/tasks";
import type { ContractCard, PipelineCard, StatusRow } from "@/server/files";
import { StageEditor } from "./StageEditor";

type Tab = "buyers" | "sellers" | "uc";
const BAR = ["bg-misty", "bg-mint", "bg-moss"];

/** Where each client is (SPEC.md §7.3). Drag a buyer or seller card to another stage to move it (owner request 2026-11-24);
 *  that runs the same move as the status on their page (checklists included). */
export function PipelineBoard({ cards, contracts, closed, statuses, today, initialTab, canEditStages, ticker }: { ticker: string[]; cards: PipelineCard[]; contracts: ContractCard[]; closed: ContractCard[]; statuses: Record<"buyer" | "listing" | "uc", StatusRow[]>; today: string; initialTab: Tab; canEditStages: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [moved, setMoved] = useState<Record<string, string>>({}); // fileId → stage, shown at once while the move saves
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moveMsg, setMoveMsg] = useState("");
  const [, start] = useTransition();
  const drop = (fileId: string, statusId: string) => {
    const card = cards.find((c) => c.id === fileId);
    if (!card || (moved[fileId] ?? card.statusId) === statusId || statusId === "none") return;
    setMoved({ ...moved, [fileId]: statusId }); setMoveMsg("");
    start(async () => {
      const r = await setFileStatus({ id: fileId, statusId });
      if (!r.ok) { setMoved((m) => { const n = { ...m }; delete n[fileId]; return n; }); setMoveMsg(r.error); return; }
      setMoveMsg(`${card.kind === "buyer" ? card.personName : (card.address ?? card.personName).split(",")[0]} moved to ${r.data!.name}${r.data!.tasks ? ` (${r.data!.tasks} checklist tasks added)` : ""}.`);
      router.refresh();
    });
  };
  useEffect(() => { window.history.replaceState(null, "", tab === "buyers" ? "/pipeline" : `/pipeline?tab=${tab}`); }, [tab]);
  const live = cards.map((c) => (moved[c.id] ? { ...c, statusId: moved[c.id] } : c));
  const buyers = live.filter((c) => c.kind === "buyer"), sellers = live.filter((c) => c.kind === "listing");
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
      <Ticker keys={ticker} statuses={statuses} count={(kind, id) => kind === "uc" ? contracts.filter((c) => c.columnId === id).length : (kind === "buyer" ? buyers : sellers).filter((c) => c.statusId === id).length}
        volume={(kind, id) => kind === "uc" ? contracts.filter((c) => c.columnId === id).reduce((t, c) => t + c.price, 0) : 0}
        onOpen={(kind) => setTab(kind === "buyer" ? "buyers" : kind === "listing" ? "sellers" : "uc")} />
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
        {tab === "uc" ? "Shows where each contract is." : "Drag a card to another stage to move it, or open the client."}
      </p>
      {moveMsg && <p role="status" className="mt-1 text-sm font-semibold text-accent">{moveMsg}</p>}
      {editing ? (
        <StageEditor kind={statusKind} rows={statuses[statusKind]} counts={Object.fromEntries(columns.map((c) => [c.key, c.items.length]))} onDone={() => setEditing(false)} />
      ) : (
        // Every stage is a column, all in one row with no scrolling (owner request 2026-11-24; cards trimmed to one line
        // each); empty stages are about half as wide so the ones with clients get the room; every card shows.
        <div className="mt-3 grid w-full items-start gap-1 pb-3 max-md:!grid-cols-1" style={{ gridTemplateColumns: columns.map((c) => (c.items.length ? "minmax(0, 1fr)" : "minmax(0, 0.55fr)")).join(" ") }}>
          {columns.map((c, i) => {
            const total = c.items.reduce((t, x) => t + (x.price ?? 0), 0);
            const shown = c.items; // every card shows (owner request 2026-11-24: "should always show all")
            return (
              <section key={c.key} aria-label={c.name} className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-sunken ${over === c.key && dragging ? "border-accent ring-2 ring-accent/40" : "border-misty"}`}
                onDragOver={(e) => { if (!dragging || tab === "uc" || c.key === "none") return; e.preventDefault(); setOver(c.key); }}
                onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/hq-file") || dragging; setOver(null); setDragging(null); if (id && tab !== "uc") drop(id, c.key); }}>
                <div className={`h-[3px] ${c.closed ? "bg-moss" : tab === "uc" ? "bg-coral" : BAR[i % 3]}`} />
                <div className="flex items-baseline justify-between gap-1 border-b border-misty bg-white px-1.5 py-1 text-[12px]" title={c.name}><b className="leading-tight">{c.name}</b><span className="flex-none text-[11px] muted">{c.items.length}{total ? ` · ${kMoney(total)}` : ""}</span></div>
                <div className="flex flex-col gap-0.5 p-0.5">
                  {shown.map((x) => "fileId" in x ? <ContractTile key={x.id} card={x} today={today} closed={!!c.closed} /> : <Card key={x.id} card={x} today={today} onDrag={(on) => setDragging(on ? x.id : null)} />)}
                  {!c.items.length && <span className="py-2 text-center text-xs muted">—</span>}
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
  return <span title={HEALTH_LABEL[h as keyof typeof HEALTH_LABEL]} aria-label={HEALTH_LABEL[h as keyof typeof HEALTH_LABEL]} className={`h-1.5 w-1.5 flex-none rounded-full ${h === "r" ? "bg-bad" : h === "y" ? "bg-[#d4a017]" : "bg-mint"}`} />;
}

/** The next task line with the assignees' initials: red when late. */
function Next({ n, today, assignees = [] }: { n: { title: string; due: string | null } | null; today: string; assignees?: string[] }) {
  const late = !!n?.due && n.due < today;
  return (
    <span className={`flex min-w-0 items-center gap-1 text-[11px] ${late ? "font-semibold text-bad" : "muted"}`} title={n ? `${n.title} · ${n.due ? shortDay(n.due) : "no date"}${assignees.length ? ` · ${assignees.join(", ")}` : ""}` : undefined}>
      <span className="min-w-0 truncate">{n ? n.title : "All caught up"}</span>
      {n && <span className="flex-none">{n.due ? shortDay(n.due) : ""}</span>}
      {assignees.map((a) => <span key={a} title={a} className="inline-grid h-3.5 w-3.5 flex-none place-items-center rounded-full bg-accent-soft text-[7px] font-bold text-accent">{initials(a)}</span>)}
    </span>
  );
}

/** A compact card: name and health dot, then (sellers) who / days on market, then the next task (owner-approved 2026-10-28). */
function Card({ card, today, onDrag }: { card: PipelineCard; today: string; onDrag: (on: boolean) => void }) {
  const title = card.kind === "buyer" ? card.personName : (card.address ?? "Listing").split(",")[0];
  const i = card.info;
  const sub = card.kind === "buyer"
    ? (i.repExpires ? `Rep expires ${shortDay(i.repExpires)}` : "")
    : [card.personName, card.status === "Active" && i.active ? `${Math.max(0, diffDays(today, i.active))} days on market` : i.photos ? `Photos ${shortDay(i.photos)}` : ""].filter(Boolean).join(" · ");
  return (
    <Link href={`/people/${card.personId}?from=pipeline`} title={card.notes ? `Deal notes: ${card.notes}` : undefined} draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/hq-file", card.id); e.dataTransfer.effectAllowed = "move"; onDrag(true); }} onDragEnd={() => onDrag(false)}
      className="flex min-w-0 cursor-grab flex-col rounded border border-misty bg-white px-1.5 py-1 text-[12px] leading-tight hover:border-accent">
      <span className="flex items-center justify-between gap-1"><b className="min-w-0 truncate" title={title}>{title}</b><Dot h={health(card.overdue)} /></span>
      {sub && <span className="truncate text-[11px] muted" title={sub}>{sub}</span>}
      <Next n={card.nextTask} today={today} assignees={card.assignees} />
    </Link>
  );
}

function ContractTile({ card, today, closed }: { card: ContractCard; today: string; closed: boolean }) {
  return (
    <Link href={`/people/${card.personId}?from=pipeline`} className="flex min-w-0 flex-col rounded border border-misty bg-white px-1.5 py-1 text-[12px] leading-tight hover:border-accent">
      <span className="flex items-center justify-between gap-1">
        <span className="min-w-0 truncate"><span className={`mr-1 rounded px-1 text-[9px] font-bold uppercase ${card.side === "buyer" ? "bg-accent-soft text-accent" : "bg-[#f6e3d9] text-[#9a4f2e]"}`}>{card.side === "buyer" ? "Buyer" : "Seller"}</span><b title={card.address}>{card.address.split(",")[0]}</b></span>
        {!closed && <Dot h={health(card.overdue)} />}
      </span>
      <span className="truncate text-[11px] muted">{card.personName} · {kMoney(card.price)}{closed ? ` · Closed ${card.endedOn ? shortDay(card.endedOn) : ""}` : card.dates.closing ? ` · Closing ${shortDay(card.dates.closing)}` : ""}</span>
      {!closed && <Next n={card.nextTask} today={today} />}
    </Link>
  );
}

const KIND_LABEL = { buyer: "Buyer", listing: "Seller", uc: "Under contract" } as const;
type Kind = keyof typeof KIND_LABEL;

/** The ticker (owner request 2026-11-24): a count for each stage you pick, across the top; "Edit ticker" to choose. */
function Ticker({ keys, statuses, count, volume, onOpen }: { keys: string[]; statuses: Record<Kind, StatusRow[]>; count: (k: Kind, id: string) => number; volume: (k: Kind, id: string) => number; onOpen: (k: Kind) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(keys);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const items = keys.map((k) => { const [kind, id] = k.split(":") as [Kind, string]; const s = statuses[kind]?.find((x) => x.id === id); return s ? { k, kind, id, name: s.name } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
  const dup = (name: string) => items.filter((x) => x.name === name).length > 1;
  const save = () => start(async () => { setError(""); const r = await saveTickerAction(picked); if (!r.ok) { setError(r.error); return; } setEditing(false); router.refresh(); });
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((x) => {
          const n = count(x.kind, x.id), v = volume(x.kind, x.id);
          return (
            <button key={x.k} type="button" onClick={() => onOpen(x.kind)} title={`${KIND_LABEL[x.kind]} · ${x.name}: open that tab`}
              className="flex items-baseline gap-1.5 rounded-lg border border-misty bg-white px-3 py-1.5 hover:border-accent">
              <b className="text-lg leading-none">{n}</b>
              <span className="text-xs">{x.name}{dup(x.name) ? ` (${KIND_LABEL[x.kind].toLowerCase()})` : ""}{v ? ` · ${kMoney(v)}` : ""}</span>
            </button>
          );
        })}
        <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => { setPicked(keys); setEditing(!editing); }}>{items.length ? "Edit ticker" : "+ Add a ticker of stage counts"}</button>
      </div>
      {editing && (
        <div className="card mt-2 p-3 text-sm">
          <p className="font-semibold">Count these stages at the top</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {(["buyer", "listing", "uc"] as Kind[]).map((kind) => (
              <fieldset key={kind}><legend className="mb-1 text-xs font-semibold uppercase muted">{kind === "buyer" ? "Buyers" : kind === "listing" ? "Sellers" : "Under contract"}</legend>
                {statuses[kind].map((s) => { const k = `${kind}:${s.id}`; return (
                  <label key={k} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={picked.includes(k)} onChange={(e) => setPicked(e.target.checked ? [...picked, k] : picked.filter((x) => x !== k))} />{s.name}</label>
                ); })}
              </fieldset>
            ))}
          </div>
          {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
          <div className="mt-3 flex gap-2"><button type="button" className="btn btn-primary" disabled={pending} onClick={save}>Save</button><button type="button" className="btn" disabled={pending} onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
