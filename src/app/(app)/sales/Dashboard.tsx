"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { SaleView } from "@/server/sales";
import { breakdown, byMonth, compareYears, dashboard, DASH_CARDS, DASH_SIZES, DEFAULT_DASHBOARD, MONTHS, periodOf, saleYears, STATUS_LABEL, SUBS_FOR, TILE_SUBS, totals,
  type DashCard, type DashCardKind, type DashSize, type TileSub, type Period, type StatSale, type Totals } from "@/lib/sales";
import { saveDashboardAction } from "./actions";

// The owner's Sales dashboard (SPEC.md §7.6): cards the owner picks, orders and sizes with Customize (owner request 2026-11-22).
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const short$ = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : $(n));
const pct = (n: number) => `${n.toFixed(2)}%`;
const day = (iso: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}/${y.slice(2)}`; };
const stat = (rows: SaleView[]): StatSale[] => rows.map((r) => ({ status: r.status, side: r.side, closeDate: r.closeDate, source: r.source, referredFrom: r.referredFrom, price: r.price, listPrice: r.listPrice, gross: r.gross, net: r.net, commissionPaid: r.commissionPaid }));
// Grid spans: 12 columns on wide screens, 2 small cards per row on a phone.
const SPAN: Record<DashSize, string> = { small: "col-span-6 md:col-span-4 xl:col-span-2", medium: "col-span-12 md:col-span-6 xl:col-span-4", half: "col-span-12 lg:col-span-6", full: "col-span-12" };

type Ctx = {
  rows: SaleView[]; all: StatSale[]; year: number; kind: Period; label: string;
  p: ReturnType<typeof periodOf> & { year: number }; d: ReturnType<typeof dashboard>; cmp: ReturnType<typeof compareYears>; prev?: Totals & { year: number };
};

export function Dashboard({ rows, today, cards }: { rows: SaleView[]; today: string; cards: DashCard[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Period>("year");
  const all = useMemo(() => stat(rows), [rows]);
  const years = useMemo(() => saleYears(all, today), [all, today]); // a new year shows as soon as a sale is dated in it
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [editing, setEditing] = useState<DashCard[] | null>(null);
  const [adding, setAdding] = useState<DashCardKind | "">("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const p = { ...periodOf(kind, today), year };
  const cmp = compareYears(all, p);
  const ctx: Ctx = { rows, all, year, kind, p, d: dashboard(all, p), cmp, prev: cmp.find((c) => c.year === year - 1), label: kind === "year" ? `${year}` : `${p.label} ${year}` };
  const list = editing ?? cards;

  const move = (i: number, by: number) => { if (!editing) return; const n = [...editing]; const j = i + by; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setEditing(n); };
  const setSub = (i: number, sub: TileSub) => editing && setEditing(editing.map((c, k) => (k === i ? { ...c, sub: sub === "usual" ? undefined : sub } : c)));
  const resize = (i: number, size: DashSize) => editing && setEditing(editing.map((c, k) => (k === i ? { ...c, size } : c)));
  const remove = (i: number) => editing && setEditing(editing.filter((_, k) => k !== i));
  const add = () => { if (!editing || !adding) return; setEditing([...editing, { id: `${adding}-${Date.now().toString(36)}`, kind: adding, size: DASH_CARDS[adding].size }]); setAdding(""); };
  const save = (next: DashCard[]) => start(async () => { setError(""); const r = await saveDashboardAction(next); if (!r.ok) { setError(r.error); return; } setEditing(null); router.refresh(); });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["month", `This month (${MONTHS[p.month - 1]})`], ["quarter", `This quarter (Q${p.quarter})`], ["year", "Whole year"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${kind === k ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{l}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold">Year
          <select className="input w-auto py-1" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[...new Set([Number(today.slice(0, 4)), ...years])].sort((a, b) => b - a).map((y) => <option key={y}>{y}</option>)}</select>
        </label>
        {!editing && <button type="button" className="btn text-sm" onClick={() => setEditing(cards)}>Customize</button>}
      </div>

      {editing && (
        <div className="card flex flex-wrap items-center gap-2 border-accent p-3">
          <b className="text-sm">Customizing:</b><span className="text-sm muted">move, resize or remove cards below, or add one.</span>
          <select className="input w-auto py-1 text-sm" aria-label="Card to add" value={adding} onChange={(e) => setAdding(e.target.value as DashCardKind | "")}>
            <option value="">+ Add a card…</option>
            {(Object.keys(DASH_CARDS) as DashCardKind[]).map((k) => <option key={k} value={k}>{DASH_CARDS[k].label} · {DASH_CARDS[k].about}</option>)}
          </select>
          <button type="button" className="btn text-sm" disabled={!adding} onClick={add}>Add</button>
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={() => save(editing)}>Save</button>
            <button type="button" className="btn text-sm" disabled={pending} onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
            <button type="button" className="btn text-sm muted" disabled={pending} onClick={() => setEditing(DEFAULT_DASHBOARD)}>Start over with the usual cards</button>
          </span>
          {error && <p role="alert" className="w-full text-sm text-bad">{error}</p>}
        </div>
      )}

      {!list.length && <p className="card p-5 text-sm muted">No cards. {editing ? "Add one above." : "Click Customize to add some."}</p>}
      <div className="grid grid-cols-12 gap-3">
        {list.map((c, i) => (
          <div key={c.id} className={`${SPAN[c.size]} flex flex-col`}>
            {editing && (
              <div className="mb-1 flex flex-wrap items-center gap-1 rounded-lg bg-sunken px-2 py-1 text-xs">
                <b className="mr-auto truncate">{DASH_CARDS[c.kind].label}</b>
                <button type="button" className="btn px-1.5 py-0 text-xs" aria-label={`Move ${DASH_CARDS[c.kind].label} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                <button type="button" className="btn px-1.5 py-0 text-xs" aria-label={`Move ${DASH_CARDS[c.kind].label} later`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>→</button>
                <select className="rounded border border-misty bg-white px-1 py-0 text-xs" aria-label={`Size of ${DASH_CARDS[c.kind].label}`} value={c.size} onChange={(e) => resize(i, e.target.value as DashSize)}>
                  {(Object.keys(DASH_SIZES) as DashSize[]).map((s) => <option key={s} value={s}>{DASH_SIZES[s]}</option>)}
                </select>
                {SUBS_FOR[c.kind] && (
                  <select className="rounded border border-misty bg-white px-1 py-0 text-xs" aria-label={`Line under ${DASH_CARDS[c.kind].label}`} title="What shows under the number" value={c.sub ?? "usual"} onChange={(e) => setSub(i, e.target.value as TileSub)}>
                    {SUBS_FOR[c.kind]!.map((t) => <option key={t} value={t}>Below: {TILE_SUBS[t]}</option>)}
                  </select>
                )}
                <button type="button" className="btn px-1.5 py-0 text-xs text-bad" aria-label={`Remove ${DASH_CARDS[c.kind].label}`} onClick={() => remove(i)}>✕</button>
              </div>
            )}
            <div className={`flex-1 ${editing ? "pointer-events-none opacity-90" : ""}`}><CardBody card={c} ctx={ctx} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card h-full p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</div>
      <div className={`text-xl font-extrabold ${tone}`}>{value}</div>
      {sub && <div className="text-xs muted">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card h-full overflow-hidden">
      <h2 className="border-b border-misty px-3 py-2 font-bold">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function CardBody({ card, ctx }: { card: DashCard; ctx: Ctx }) {
  const { d, prev, year, label, cmp, p, all, rows, kind } = ctx;
  const vs = (a: number, b: number | undefined) => (b ? `${a >= b ? "▲" : "▼"} ${Math.abs(((a - b) / (b || 1)) * 100).toFixed(0)}% vs ${year - 1}` : `${year - 1}: none`);
  // The line under a tile: the owner's pick for this card (Customize → "Below: …"), else the usual one.
  const pick = (lines: Partial<Record<TileSub, string>>) => (card.sub === "none" ? "" : (card.sub && lines[card.sub]) ?? lines.usual ?? "");
  const per = (n: number) => (d.closed.deals ? n / d.closed.deals : 0);
  const vsLine = (a: number, b: number | undefined, _f: (n: number) => string) => (b ? vs(a, b) : `${year - 1}: none`);
  const cmpLines = (a: number, b: number | undefined, f: (n: number) => string): Partial<Record<TileSub, string>> => ({
    vsLast: b ? vs(a, b) : `${year - 1}: none`,
    diffLast: b !== undefined ? `${a >= b ? "+" : "−"}${f(Math.abs(a - b))} vs ${year - 1}` : `${year - 1}: none`,
    lastYear: `${year - 1}: ${b !== undefined ? f(b) : "none"}`,
  });
  const periodTitle = kind === "year" ? "every year" : `${p.label} in every year`;
  switch (card.kind) {
    case "pending": return <Tile label="Pending sales" value={String(d.pending.deals)} sub={pick({ usual: `${$(d.pending.volume)} · GCI ${$(d.pending.gross)}`, gci: `GCI ${$(d.pending.gross)}`, deals: `${$(d.pending.volume)} volume` })} tone="text-[#24507a]" />;
    case "closed": return <Tile label={`Sales · ${label}`} value={String(d.closed.deals)} sub={pick({ usual: [d.pendingInPeriod ? `${d.pendingInPeriod} still pending` : "", vsLine(d.closed.deals, prev?.deals, String)].filter(Boolean).join(" · "), ...cmpLines(d.closed.deals, prev?.deals, (n) => `${n} sales`) })} />;
    case "volume": return <Tile label={`Volume · ${label}`} value={$(d.closed.volume)} sub={pick({ usual: vsLine(d.closed.volume, prev?.volume, $), ...cmpLines(d.closed.volume, prev?.volume, $), perSale: `${$(d.closed.avgPrice)} per sale`, deals: `${d.closed.deals} sales`, gci: `GCI ${$(d.closed.gross)}` })} />;
    case "gross": return <Tile label={`Gross commission · ${label}`} value={$(d.closed.gross)} sub={pick({ usual: `${pct(d.closed.grossPct)} of volume`, pctVolume: `${pct(d.closed.grossPct)} of volume`, ...cmpLines(d.closed.gross, prev?.gross, $), perSale: `${$(per(d.closed.gross))} per sale`, deals: `${d.closed.deals} sales` })} />;
    case "net": return <Tile label={`Net income · ${label}`} value={$(d.closed.net)} sub={pick({ usual: `${pct(d.closed.splitPct)} split${prev ? ` · ${vsLine(d.closed.net, prev.net, $)}` : ""}`, split: `${pct(d.closed.splitPct)} split`, pctVolume: `${pct(d.closed.volume ? (d.closed.net / d.closed.volume) * 100 : 0)} of volume`, ...cmpLines(d.closed.net, prev?.net, $), perSale: `${$(per(d.closed.net))} per sale`, deals: `${d.closed.deals} sales` })} tone="text-accent" />;
    case "owed": return <Tile label={`Commission not paid · ${label}`} value={$(d.notPaid.net)} sub={pick({ usual: `${d.notPaid.deals} sale${d.notPaid.deals === 1 ? "" : "s"}${d.notPaid.pending ? ` (${d.notPaid.pending} pending)` : ""}`, gci: `GCI ${$(d.notPaid.gross)}` })} tone={d.notPaid.deals ? "text-[#9a6400]" : ""} />;
    case "paid": return <Tile label={`Commission paid · ${label}`} value={$(d.paid.net)} sub={pick({ usual: `${d.paid.deals} closed sale${d.paid.deals === 1 ? "" : "s"} marked paid`, gci: `GCI ${$(d.paid.gross)}` })} tone="text-accent" />;
    case "avgPrice": return <Tile label={`Average sale price · ${label}`} value={$(d.closed.avgPrice)} sub={pick({ usual: vsLine(d.closed.avgPrice, prev?.avgPrice, $), ...cmpLines(d.closed.avgPrice, prev?.avgPrice, $), deals: `${d.closed.deals} sales` })} />;
    case "saleToList": return <Tile label={`Sale-to-list · ${label}`} value={d.closed.listVolume ? pct(d.closed.netPct) : "—"} sub={pick({ usual: "sale price ÷ list price", vsLast: vsLine(d.closed.netPct, prev?.listVolume ? prev.netPct : undefined, pct), lastYear: prev?.listVolume ? `${year - 1}: ${pct(prev.netPct)}` : `${year - 1}: none` })} />;
    case "sides": {
      const inP = all.filter((r) => r.status === "closed" && r.closeDate?.startsWith(String(year)) && periodHas(r.closeDate, p));
      const b = totals(inP.filter((r) => r.side === "buyer")), s = totals(inP.filter((r) => r.side === "seller"));
      return <Tile label={`Buyers vs sellers · ${label}`} value={`${b.deals} / ${s.deals}`} sub={`${$(b.volume)} buyer · ${$(s.volume)} seller`} />;
    }
    case "everyYear": return (
      <Panel title={kind === "year" ? "Every year" : `${p.label} in every year`}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs muted"><th className="px-3 py-1">Year</th><th>Sales</th><th>Pending</th><th>Volume</th><th>Gross comm.</th><th className="pr-3">Net income</th></tr></thead>
          <tbody>{cmp.map((c) => (
            <tr key={c.year} className={`border-t border-misty/60 ${c.year === year ? "bg-accent-soft font-semibold" : ""}`}><td className="px-3 py-1">{c.year}</td><td>{c.deals}</td><td className="muted">{c.pending ? `${c.pending} · ${short$(c.pendingVolume)}` : "—"}</td><td>{$(c.volume)}</td><td>{$(c.gross)}</td><td className="pr-3">{$(c.net)}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
    );
    case "volumeChart": return <Panel title={`Volume · ${periodTitle}`}><YearBars bars={[...cmp].reverse().map((c) => ({ key: String(c.year), value: c.volume, text: $(c.volume), sub: `${c.deals} sales`, on: c.year === year }))} fmt={short$} /></Panel>;
    case "dealsChart": return <Panel title={`Closed sales · ${periodTitle}`}><YearBars bars={[...cmp].reverse().map((c) => ({ key: String(c.year), value: c.deals, text: `${c.deals} sales`, sub: $(c.volume), on: c.year === year }))} fmt={(n) => String(n)} /></Panel>;
    case "netChart": return <Panel title={`Net income · ${periodTitle}`}><YearBars bars={[...cmp].reverse().map((c) => ({ key: String(c.year), value: c.net, text: $(c.net), sub: `${c.deals} sales`, on: c.year === year }))} fmt={short$} /></Panel>;
    case "monthly": return <Panel title={`Volume by month · ${year} vs ${year - 1}`}><Monthly now={byMonth(all, year)} before={byMonth(all, year - 1)} year={year} /></Panel>;
    case "bySource": return <Panel title={`By lead source · ${label}`}><Breakdown rows={breakdown(all, "source", p, year)} /></Panel>;
    case "byReferral": return <Panel title={`By referral · ${label}`}><Breakdown rows={breakdown(all, "referredFrom", p, year)} /></Panel>;
    case "sourceChart": {
      const src = breakdown(all, "source", p, year);
      const max = Math.max(1, ...src.map((s) => s.volume));
      return (
        <Panel title={`Volume by lead source · ${label}`}>
          {!src.length ? <p className="px-3 py-2 text-sm muted">No closed sales in this period.</p> : (
            <ul className="flex flex-col gap-1.5 px-3 py-2">{src.map((s) => (
              <li key={s.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs" title={`${s.key}: ${$(s.volume)} · ${s.deals} sales · net ${$(s.net)}`}>
                <span className="truncate">{s.key}</span>
                <span className="h-3 rounded-r bg-accent" style={{ width: `${Math.max(2, (s.volume / max) * 100)}%` }} />
                <span className="tabular-nums">{short$(s.volume)} · {s.deals}</span>
              </li>
            ))}</ul>
          )}
        </Panel>
      );
    }
    case "pendingList": {
      const list = rows.filter((r) => r.status === "pending").sort((a, b) => (a.closeDate ?? "9").localeCompare(b.closeDate ?? "9"));
      return (
        <Panel title={`Pending deals · ${list.length}`}>
          {!list.length ? <p className="px-3 py-2 text-sm muted">Nothing under contract.</p> : <SaleRows rows={list} />}
        </Panel>
      );
    }
    case "owedList": {
      const list = rows.filter((r) => r.status === "pending" || (r.status === "closed" && !r.commissionPaid)).sort((a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? ""));
      return (
        <Panel title={`Commission not paid · ${list.length}`}>
          {!list.length ? <p className="px-3 py-2 text-sm muted">Every sale is marked paid.</p> : <SaleRows rows={list} net />}
        </Panel>
      );
    }
  }
}

function periodHas(iso: string, p: { kind: Period; month: number; quarter: number }) {
  const m = Number(iso.slice(5, 7));
  return p.kind === "year" || (p.kind === "month" ? m === p.month : Math.ceil(m / 3) === p.quarter);
}

function SaleRows({ rows, net }: { rows: SaleView[]; net?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs muted"><th className="px-3 py-1">Client</th><th>Address</th><th>Close</th><th className="pr-3 text-right">{net ? "Net" : "Price"}</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} className="border-t border-misty/60">
          <td className="px-3 py-1">{r.people[0] ? <Link href={`/people/${r.people[0].id}`} className="font-semibold text-accent hover:underline">{r.clientName || r.people[0].name}</Link> : <b>{r.clientName || "—"}</b>}
            <span className="block text-[10px] muted">{r.side === "buyer" ? "Buyer" : "Seller"} · {STATUS_LABEL[r.status]}</span></td>
          <td>{r.address}</td><td>{day(r.closeDate)}</td><td className="pr-3 text-right">{$(net ? r.net : r.price)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Breakdown({ rows }: { rows: ({ key: string } & Totals)[] }) {
  if (!rows.length) return <p className="px-3 py-2 text-sm muted">No closed sales in this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs muted"><th className="px-3 py-1"></th><th>Sales</th><th>Volume</th><th className="pr-3">Net income</th></tr></thead>
      <tbody>{rows.map((b) => <tr key={b.key} className="border-t border-misty/60"><td className="px-3 py-1">{b.key}</td><td>{b.deals}</td><td>{$(b.volume)}</td><td className="pr-3">{$(b.net)}</td></tr>)}</tbody>
    </table>
  );
}

/** Vertical bars, one per year (oldest first); the chosen year is darker. Hover shows the numbers. */
function YearBars({ bars, fmt }: { bars: { key: string; value: number; text: string; sub: string; on: boolean }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="px-3 pb-2 pt-3">
      <div className="flex h-40 items-end gap-1.5 border-b border-misty" role="img" aria-label={bars.map((b) => `${b.key}: ${b.text}`).join(", ")}>
        {bars.map((b) => (
          <div key={b.key} className="group relative flex h-full flex-1 flex-col justify-end" title={`${b.key}: ${b.text} · ${b.sub}`}>
            <span className="mb-0.5 text-center text-[10px] tabular-nums muted">{b.value ? fmt(b.value) : ""}</span>
            <span className={`rounded-t ${b.on ? "bg-accent" : "bg-accent/45 group-hover:bg-accent/70"}`} style={{ height: `${(b.value / max) * 80}%`, minHeight: b.value ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">{bars.map((b) => <span key={b.key} className={`flex-1 text-center text-[10px] ${b.on ? "font-bold" : "muted"}`}>{b.key.slice(2) ? `’${b.key.slice(2)}` : b.key}</span>)}</div>
    </div>
  );
}

/** Two bars a month: the chosen year (dark) next to the year before (light), with a legend. */
function Monthly({ now, before, year }: { now: ReturnType<typeof byMonth>; before: ReturnType<typeof byMonth>; year: number }) {
  const max = Math.max(1, ...now.map((m) => m.volume), ...before.map((m) => m.volume));
  return (
    <div className="px-3 pb-2 pt-2">
      <div className="mb-2 flex gap-4 text-xs"><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />{year}</span><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#c9b48a]" />{year - 1}</span></div>
      <div className="flex h-40 items-end gap-2 border-b border-misty" role="img" aria-label={now.map((m, i) => `${MONTHS[i]}: ${$(m.volume)} in ${year}, ${$(before[i].volume)} in ${year - 1}`).join("; ")}>
        {now.map((m, i) => (
          <div key={m.month} className="flex h-full flex-1 items-end justify-center gap-[2px]" title={`${MONTHS[i]}: ${year} ${$(m.volume)} (${m.deals} sales) · ${year - 1} ${$(before[i].volume)} (${before[i].deals} sales)`}>
            <span className="w-1/2 max-w-4 rounded-t bg-accent" style={{ height: `${(m.volume / max) * 100}%`, minHeight: m.volume ? 2 : 0 }} />
            <span className="w-1/2 max-w-4 rounded-t bg-[#c9b48a]" style={{ height: `${(before[i].volume / max) * 100}%`, minHeight: before[i].volume ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">{MONTHS.map((m) => <span key={m} className="flex-1 text-center text-[10px] muted">{m.slice(0, 3)}</span>)}</div>
    </div>
  );
}
