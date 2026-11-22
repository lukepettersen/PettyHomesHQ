"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { SaleView } from "@/server/sales";
import { breakdown, compareYears, dashboard, MONTHS, periodOf, SOURCES, STATUS_LABEL, yearSummary, type Period, type StatSale, type Totals } from "@/lib/sales";
import { applyImportAction, deleteSaleAction, findPeopleAction, previewImportAction, resolveReviewAction, saveSaleAction } from "./actions";

// The owner's Sales tab (SPEC.md §7.9), modeled on the master file: Dashboard (SALES COMPARE), Summary (SUMMARY),
// All sales (DATA), Review (sales to match to contacts) and Import.
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const day = (iso: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}/${y.slice(2)}`; };
const stat = (rows: SaleView[]): StatSale[] => rows.map((r) => ({ status: r.status, side: r.side, closeDate: r.closeDate, source: r.source, referredFrom: r.referredFrom, price: r.price, listPrice: r.listPrice, gross: r.gross, net: r.net, commissionPaid: r.commissionPaid }));
type Tab = "dashboard" | "summary" | "list" | "review" | "import";

export function SalesApp({ rows, today }: { rows: SaleView[]; today: string }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const review = rows.filter((r) => r.review?.length);
  const tabs: [Tab, string, number | null][] = [["dashboard", "Dashboard", null], ["summary", "Summary", null], ["list", "All sales", rows.length], ["review", "Review", review.length], ["import", "Import", null]];
  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Sales</h1>
        <span className="text-xs muted">Only you can see this tab.</span>
      </div>
      <div className="mt-3 flex gap-1 overflow-x-auto border-b border-misty" role="tablist" aria-label="Sales">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-semibold ${tab === k ? "border-coral text-charcoal" : "border-transparent muted hover:text-charcoal"}`}>
            {l}{n !== null && <span className={`rounded-full px-1.5 text-xs ${k === "review" && n ? "bg-[#f6efd9] text-[#7a5d12]" : tab === k ? "bg-accent text-white" : "bg-sunken"}`}>{n}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === "dashboard" && <Dashboard rows={rows} today={today} />}
        {tab === "summary" && <Summary rows={rows} />}
        {tab === "list" && <SalesList rows={rows} today={today} />}
        {tab === "review" && <Review rows={review} />}
        {tab === "import" && <Import />}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</div>
      <div className={`text-xl font-extrabold ${tone}`}>{value}</div>
      {sub && <div className="text-xs muted">{sub}</div>}
    </div>
  );
}

/** The master file's SALES COMPARE: this month / quarter / year next to the same period in past years, by source and referral. */
function Dashboard({ rows, today }: { rows: SaleView[]; today: string }) {
  const [kind, setKind] = useState<Period>("year");
  const all = useMemo(() => stat(rows), [rows]);
  const years = useMemo(() => [...new Set(all.filter((r) => r.closeDate).map((r) => Number(r.closeDate!.slice(0, 4))))].sort((a, b) => b - a), [all]);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const p = { ...periodOf(kind, today), year };
  const d = dashboard(all, p);
  const cmp = compareYears(all, p);
  const prev = cmp.find((c) => c.year === year - 1);
  const src = breakdown(all, "source", p, year), refs = breakdown(all, "referredFrom", p, year);
  const label = kind === "year" ? `${year}` : `${p.label} ${year}`;
  const vs = (a: number, b: number | undefined) => (b ? `${a >= b ? "▲" : "▼"} ${Math.abs(((a - b) / (b || 1)) * 100).toFixed(0)}% vs ${year - 1}` : `${year - 1}: none`);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["month", `This month (${MONTHS[p.month - 1]})`], ["quarter", `This quarter (Q${p.quarter})`], ["year", "Whole year"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${kind === k ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{l}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold">Year
          <select className="input w-auto py-1" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[...new Set([Number(today.slice(0, 4)), ...years])].sort((a, b) => b - a).map((y) => <option key={y}>{y}</option>)}</select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Pending sales" value={String(d.pending.deals)} sub={`${$(d.pending.volume)} · GCI ${$(d.pending.gross)}`} tone="text-[#24507a]" />
        <Tile label={`Closed · ${label}`} value={String(d.closed.deals)} sub={prev ? vs(d.closed.deals, prev.deals) : ""} />
        <Tile label="Volume" value={$(d.closed.volume)} sub={prev ? vs(d.closed.volume, prev.volume) : ""} />
        <Tile label="Gross commission" value={$(d.closed.gross)} sub={`${pct(d.closed.grossPct)} of volume`} />
        <Tile label="Net income" value={$(d.closed.net)} sub={`${pct(d.closed.splitPct)} split`} tone="text-accent" />
        <Tile label="Commission owed to you" value={$(d.outstanding.net)} sub={`${d.outstanding.deals} closed, not marked paid`} tone={d.outstanding.deals ? "text-[#9a6400]" : ""} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-misty px-3 py-2 font-bold">{kind === "year" ? "Every year" : `${p.label} in every year`}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs muted"><th className="px-3 py-1">Year</th><th>Sales</th><th>Volume</th><th>Gross comm.</th><th className="pr-3">Net income</th></tr></thead>
            <tbody>{cmp.map((c) => (
              <tr key={c.year} className={`border-t border-misty/60 ${c.year === year ? "bg-accent-soft font-semibold" : ""}`}><td className="px-3 py-1">{c.year}</td><td>{c.deals}</td><td>{$(c.volume)}</td><td>{$(c.gross)}</td><td className="pr-3">{$(c.net)}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-misty px-3 py-2 font-bold">By lead source · {label}</h2>
          <Breakdown rows={src} empty="No closed sales in this period." />
        </section>
      </div>
      <section className="card overflow-hidden">
        <h2 className="border-b border-misty px-3 py-2 font-bold">By referral · {label}</h2>
        <Breakdown rows={refs} empty="No closed sales in this period." />
      </section>
    </div>
  );
}

function Breakdown({ rows, empty }: { rows: ({ key: string } & Totals)[]; empty: string }) {
  if (!rows.length) return <p className="px-3 py-2 text-sm muted">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs muted"><th className="px-3 py-1"></th><th>Sales</th><th>Volume</th><th className="pr-3">Net income</th></tr></thead>
      <tbody>{rows.map((b) => <tr key={b.key} className="border-t border-misty/60"><td className="px-3 py-1">{b.key}</td><td>{b.deals}</td><td>{$(b.volume)}</td><td className="pr-3">{$(b.net)}</td></tr>)}</tbody>
    </table>
  );
}

/** The master file's SUMMARY: total, buyer and seller by year and career. */
function Summary({ rows }: { rows: SaleView[] }) {
  const all = useMemo(() => stat(rows), [rows]);
  const table = (title: string, side?: "buyer" | "seller") => {
    const s = yearSummary(all, side);
    return (
      <section className="card overflow-x-auto">
        <h2 className="border-b border-misty px-3 py-2 font-bold">{title}</h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs muted"><th className="px-3 py-1">Year</th><th>Deals</th><th>Volume</th><th>Avg sale price</th>{side && <th>List price</th>}{side && <th>Sale/list</th>}<th>Gross commission</th><th>Gross %</th><th>Commission</th><th className="pr-3">Split %</th></tr></thead>
          <tbody>
            {[...s.years.map((y) => ({ k: String(y.year), ...y })), { k: "CAREER", ...s.career }].map((y) => (
              <tr key={y.k} className={`border-t border-misty/60 ${y.k === "CAREER" ? "bg-sunken font-bold" : ""}`}>
                <td className="px-3 py-1">{y.k}</td><td>{y.deals}</td><td>{$(y.volume)}</td><td>{$(y.avgPrice)}</td>{side && <td>{$(y.listVolume)}</td>}{side && <td>{pct(y.netPct)}</td>}
                <td>{$(y.gross)}</td><td>{pct(y.grossPct)}</td><td>{$(y.net)}</td><td className="pr-3">{Math.round(y.splitPct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };
  return <div className="flex flex-col gap-4">{table("Total")}{table("Buyer transactions", "buyer")}{table("Seller transactions", "seller")}</div>;
}

/** The master file's DATA tab: every sale, filterable and editable. */
function SalesList({ rows, today }: { rows: SaleView[]; today: string }) {
  const [q, setQ] = useState("");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [side, setSide] = useState("all");
  const [editing, setEditing] = useState<SaleView | "new" | null>(null);
  const years = [...new Set(rows.map((r) => r.closeDate?.slice(0, 4)).filter((y): y is string => !!y))].sort().reverse();
  const shown = rows.filter((r) => (year === "all" || r.closeDate?.startsWith(year)) && (status === "all" || r.status === status) && (side === "all" || r.side === side)
    && (!q.trim() || `${r.clientName} ${r.address} ${r.city} ${r.referredFrom} ${r.people.map((p) => p.name).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())));
  const sel = "input w-auto py-1 text-sm";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full py-1 text-sm sm:w-64" placeholder="Find a client, address or referral" aria-label="Find a sale" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select className={sel} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Any status</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={sel} aria-label="Side" value={side} onChange={(e) => setSide(e.target.value)}><option value="all">Buyer & seller</option><option value="buyer">Buyer</option><option value="seller">Seller</option></select>
        <span className="text-sm muted">{shown.length} sales · {$(shown.reduce((a, r) => a + r.price, 0))}</span>
        <button type="button" className="btn btn-primary ml-auto text-sm" onClick={() => setEditing("new")}>+ Add a sale</button>
      </div>
      {editing && <SaleEditor sale={editing === "new" ? null : editing} today={today} onDone={() => setEditing(null)} />}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-sunken text-left text-xs"><tr>
            <th className="px-2 py-1.5">Client</th><th>Address</th><th>Close date</th><th>Type</th><th>Status</th><th>Source</th><th>Referred from</th><th className="text-right">Sale price</th><th className="text-right">Comm %</th><th className="text-right">Gross</th><th className="text-right">Net</th><th className="text-right">Split</th><th className="px-2">Paid</th><th></th>
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-misty/60 align-top hover:bg-paper">
                <td className="px-2 py-1"><b>{r.clientName || "—"}</b>{r.people.length > 0 && <span className="block text-xs">{r.people.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link href={`/people/${p.id}`} className="text-accent hover:underline">{p.name}</Link></span>)}</span>}
                  {r.review && <span className="block text-xs text-[#9a6400]">needs a contact (Review)</span>}</td>
                <td>{r.address}<span className="block text-xs muted">{[r.city, r.zip].filter(Boolean).join(" ")}</span></td>
                <td>{day(r.closeDate)}</td><td>{r.side === "buyer" ? "Buyer" : "Seller"}</td>
                <td><span className={`rounded-full px-2 text-xs font-semibold ${r.status === "closed" ? "bg-accent-soft text-accent" : r.status === "pending" ? "bg-[#e3ecf7] text-[#24507a]" : "bg-sunken"}`}>{STATUS_LABEL[r.status]}</span>{r.paId && <span className="block text-[10px] muted">from HQ contract</span>}</td>
                <td className="text-xs">{r.source}</td><td className="text-xs">{r.referredFrom}</td>
                <td className="text-right">{$(r.price)}</td><td className="text-right">{r.commissionPct ? pct(r.commissionPct) : "—"}</td><td className="text-right">{$(r.gross)}</td><td className="text-right">{$(r.net)}</td>
                <td className="text-right">{r.splitPct ? `${Math.round(r.splitPct)}%` : "—"}</td><td className={`px-2 ${r.status === "closed" && !r.commissionPaid ? "font-bold text-[#9a6400]" : ""}`}>{r.status === "closed" ? (r.commissionPaid ? "Yes" : "No") : "—"}</td>
                <td className="pr-2"><button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(r)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-sm muted">No sales match.</p>}
      </div>
    </div>
  );
}

type Draft = Omit<SaleView, "id" | "paId" | "review" | "people"> & { people: { id: string; name: string }[] };
const blank = (today: string): Draft => ({ status: "pending", side: "buyer", clientName: "", address: "", city: "", zip: "", closeDate: today, source: "", initialSource: "", lender: "", referredFrom: "", onTime: "",
  price: 0, listPrice: 0, contributions: 0, commissionPct: 2.7, gross: 0, fees: 0, net: 0, splitPct: 94, commissionPaid: false, people: [] });

function SaleEditor({ sale, today, onDone }: { sale: SaleView | null; today: string; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(sale ? { ...sale } : blank(today));
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; detail: string }[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => { if (q.trim().length < 2) return; const t = setTimeout(() => { void findPeopleAction(q).then((r) => r.ok && setHits(r.data!)); }, 200); return () => clearTimeout(t); }, [q]);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  // Gross = price × commission %; net = gross × split %, as in the master file (both can still be typed over).
  const recalc = (p: Partial<Draft>) => { const n = { ...d, ...p }; const gross = Math.round(n.price * n.commissionPct) / 100; setD({ ...n, gross, net: Math.round(gross * n.splitPct) / 100 }); };
  const save = () => start(async () => {
    setError("");
    const { people, ...rest } = d;
    const r = await saveSaleAction(sale?.id ?? null, { ...rest, personIds: people.map((p) => p.id) });
    if (!r.ok) { setError(r.error); return; }
    onDone(); router.refresh();
  });
  const remove = () => start(async () => { const r = await deleteSaleAction(sale!.id); if (!r.ok) { setError(r.error); return; } onDone(); router.refresh(); });
  const box = "input mt-1 w-full";
  const numBox = (k: "price" | "listPrice" | "contributions" | "commissionPct" | "gross" | "fees" | "net" | "splitPct", label: string, calc = false) => (
    <label className="label">{label}<input className={box} inputMode="decimal" value={String(d[k])} onChange={(e) => { const v = Number(e.target.value.replace(/[$,%\s]/g, "")) || 0; if (calc) recalc({ [k]: v }); else set({ [k]: v }); }} /></label>
  );
  return (
    <section className="card mt-3 p-4" aria-label={sale ? "Edit sale" : "Add a sale"}>
      <h2 className="font-bold">{sale ? `Edit ${sale.address}` : "Add a sale"}{sale?.paId && <span className="ml-2 text-xs font-normal muted">made from an HQ contract (price and commission % follow it)</span>}</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="label">Client name<input className={box} value={d.clientName} placeholder="Sharpe/Nguyen" onChange={(e) => set({ clientName: e.target.value })} /></label>
        <label className="label">Property address<input className={box} value={d.address} onChange={(e) => set({ address: e.target.value })} /></label>
        <label className="label">City<input className={box} value={d.city} onChange={(e) => set({ city: e.target.value })} /></label>
        <label className="label">ZIP<input className={box} value={d.zip} onChange={(e) => set({ zip: e.target.value })} /></label>
        <label className="label">Close date<input type="date" className={box} value={d.closeDate ?? ""} onChange={(e) => set({ closeDate: e.target.value || null })} /></label>
        <label className="label">Deal type<select className={box} value={d.side} onChange={(e) => set({ side: e.target.value })}><option value="buyer">Buyer</option><option value="seller">Seller</option></select></label>
        <label className="label">Status<select className={box} value={d.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="label">Source<input className={box} list="sale-sources" value={d.source} onChange={(e) => set({ source: e.target.value.toUpperCase() })} /></label>
        <label className="label">Lender<input className={box} value={d.lender} onChange={(e) => set({ lender: e.target.value })} /></label>
        <label className="label">Referred from<input className={box} value={d.referredFrom} onChange={(e) => set({ referredFrom: e.target.value })} /></label>
        <label className="label">Initial source<input className={box} list="sale-sources" value={d.initialSource} onChange={(e) => set({ initialSource: e.target.value.toUpperCase() })} /></label>
        <label className="label">On-time close?<select className={box} value={d.onTime} onChange={(e) => set({ onTime: e.target.value })}><option value="">—</option><option>YES</option><option>NO</option></select></label>
        {numBox("price", "Sale price", true)}{numBox("listPrice", "List price")}{numBox("contributions", "Seller contributions")}{numBox("commissionPct", "Commission %", true)}
        {numBox("gross", "Gross commission")}{numBox("fees", "Fees (brokerage, TC, admin…)")}{numBox("splitPct", "Split %", true)}{numBox("net", "Commission (net)")}
        <label className="mt-6 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.commissionPaid} onChange={(e) => set({ commissionPaid: e.target.checked })} />Commission paid</label>
      </div>
      <datalist id="sale-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="mt-3">
        <span className="text-sm font-semibold">Contacts</span>
        <div className="mt-1 flex flex-wrap gap-1.5">{d.people.map((p) => <span key={p.id} className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent">{p.name}<button type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ people: d.people.filter((x) => x.id !== p.id) })}>×</button></span>)}</div>
        <div className="relative mt-1 sm:w-80">
          <input className="input w-full" placeholder="Add a contact" aria-label="Add a contact" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && hits.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-lg border border-misty bg-white shadow-lg">{hits.filter((h) => !d.people.some((p) => p.id === h.id)).map((h) => <li key={h.id}><button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-sunken" onClick={() => { set({ people: [...d.people, { id: h.id, name: h.name }] }); setQ(""); setHits([]); }}><b>{h.name}</b> <span className="muted">{h.detail}</span></button></li>)}</ul>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-misty pt-3">
        {sale ? <button type="button" className="btn text-sm text-bad" onBlur={() => setSure(false)} onClick={() => (sure ? remove() : setSure(true))}>{sure ? "Click again to remove" : "Remove sale"}</button> : <span />}
        <span className="flex gap-2"><button type="button" className="btn" onClick={onDone}>Cancel</button><button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button></span>
      </div>
    </section>
  );
}

/** Sales HQ couldn't match to a contact for sure: pick one, make a new contact, or leave it with nobody. */
function Review({ rows }: { rows: SaleView[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const act = (id: string, how: object) => start(async () => { setError(""); const r = await resolveReviewAction(id, how); if (!r.ok) setError(r.error); router.refresh(); });
  if (!rows.length) return <p className="card p-5 text-sm">Nothing to review. Every sale is matched to its contact (or left with none on purpose).</p>;
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-misty px-3 py-2 text-sm muted">The master file has last names only, so these weren&apos;t a sure match. Pick who each sale belongs to.</p>
      {error && <p role="alert" className="px-3 py-2 text-sm text-bad">{error}</p>}
      <ul className="divide-y divide-misty">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span><b>{r.clientName}</b> · {r.address}{r.city ? `, ${r.city}` : ""} · {r.side === "buyer" ? "Buyer" : "Seller"} {day(r.closeDate)}{r.referredFrom && <span className="muted"> · referred by {r.referredFrom}</span>}</span>
            <span className="flex flex-wrap gap-1.5">
              {r.review!.map((c) => <button key={c.id} type="button" disabled={pending} className="btn px-2 py-0.5 text-xs" title={c.why} onClick={() => act(r.id, { personId: c.id })}>It&apos;s {c.name} <span className="muted">({c.why})</span></button>)}
              <FindContact disabled={pending} onPick={(personId) => act(r.id, { personId })} />
              <button type="button" disabled={pending} className="btn px-2 py-0.5 text-xs" onClick={() => act(r.id, { create: true })}>New contact</button>
              <button type="button" disabled={pending} className="btn px-2 py-0.5 text-xs muted" onClick={() => act(r.id, { none: true })}>No contact</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Review: search all contacts by name and link the one this sale belongs to (owner request 2026-11-22). */
function FindContact({ disabled, onPick }: { disabled: boolean; onPick: (personId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; detail: string }[]>([]);
  useEffect(() => { if (q.trim().length < 2) return; const t = setTimeout(() => { void findPeopleAction(q).then((r) => r.ok && setHits(r.data!)); }, 200); return () => clearTimeout(t); }, [q]);
  if (!open) return <button type="button" disabled={disabled} className="btn px-2 py-0.5 text-xs" onClick={() => setOpen(true)}>Search…</button>;
  const shown = q.trim().length < 2 ? [] : hits;
  return (
    <span className="relative inline-block">
      <input autoFocus className="input w-56 py-0.5 text-xs" placeholder="Search contacts by name" aria-label="Search contacts by name" value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQ(""); } }} />
      <button type="button" className="ml-1 text-xs muted underline" onClick={() => { setOpen(false); setQ(""); }}>Cancel</button>
      {shown.length > 0 && (
        <ul className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-misty bg-white shadow-lg">
          {shown.map((h) => (
            <li key={h.id}><button type="button" disabled={disabled} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent-soft" onClick={() => onPick(h.id)}>
              <b>{h.name}</b>{h.detail && <span className="muted"> · {h.detail}</span>}</button></li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !shown.length && <span className="absolute right-0 z-20 mt-1 block w-56 rounded-lg border border-misty bg-white px-3 py-1.5 text-xs muted shadow">No contacts found</span>}
    </span>
  );
}

/** Import the master file's DATA tab (saved as CSV): preview who each sale matches, then save. */
function Import() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewImportAction>> | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const read = (f: File | undefined) => { if (!f) return; void f.text().then((t) => { setCsv(t); setMsg(""); start(async () => setPreview(await previewImportAction(t))); }); };
  const save = () => start(async () => { const r = await applyImportAction(csv); if (!r.ok) { setMsg(r.error); return; } setMsg(`Imported: ${r.data!.added} sales added, ${r.data!.updated} updated, ${r.data!.created} new contacts, ${r.data!.review} to review (Review tab).`); setPreview(null); router.refresh(); });
  const p = preview?.ok ? preview.data! : null;
  const count = (k: string) => p?.rows.filter((r) => r.match === k).length ?? 0;
  return (
    <section className="card p-4">
      <h2 className="font-bold">Import the master file</h2>
      <p className="mt-1 text-sm muted">The DATA tab saved as CSV (in Google Sheets: File → Download → Comma-separated values, with the DATA tab open). Importing again updates the same sales, so nothing doubles. Each sale is matched to contacts by its address and last names; unsure ones go to Review, and anyone not in HQ is added as a contact.</p>
      <input type="file" accept=".csv,text/csv" className="mt-2 block text-sm" disabled={pending} onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
      {preview && !preview.ok && <p role="alert" className="mt-2 text-sm text-bad">{preview.error}</p>}
      {p && (
        <div className="mt-3">
          <p className="text-sm"><b>{p.rows.length} sales</b>: {count("sure")} matched to a contact, {count("review")} to review, {count("new")} new contacts, {count("update")} already in HQ (updated){p.skipped ? `, ${p.skipped} rows skipped` : ""}.</p>
          <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-misty">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-sunken text-left"><tr><th className="px-2 py-1">Client</th><th>Address</th><th>Close</th><th>Type</th><th>Contact</th></tr></thead>
              <tbody>{p.rows.map((r, i) => (
                <tr key={i} className="border-t border-misty/60"><td className="px-2 py-0.5">{r.clientName}</td><td>{r.address}</td><td>{day(r.closeDate)}</td><td>{r.side}</td>
                  <td className={r.match === "review" ? "text-[#9a6400]" : r.match === "new" ? "text-[#24507a]" : ""}>{r.match === "review" ? `Review: ${r.who}` : r.match === "new" ? `New contact: ${r.who}` : r.who}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-end gap-2"><button type="button" className="btn" onClick={() => setPreview(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Importing…" : `Import ${p.rows.length} sales`}</button></div>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
    </section>
  );
}
