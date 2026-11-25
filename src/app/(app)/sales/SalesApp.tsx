"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { SaleView } from "@/server/sales";
import { breakdown, compareYears, dashboard, DEFAULT_SALE_COLUMNS, MONTHS, periodOf, SALE_COLUMNS, SOURCES, STATUS_LABEL, saleYears, summaryBy, type DashCard, type SaleColumn, type SummaryBy, type StatSale, type Totals } from "@/lib/sales";
import { Dashboard } from "./Dashboard";
import { applyImportAction, deleteSaleAction, findPeopleAction, previewImportAction, resolveReviewAction, saveColumnsAction, saveSaleAction } from "./actions";

// The owner's Sales tab (SPEC.md §7.6), modeled on the master file: Dashboard (SALES COMPARE), Summary (SUMMARY),
// All sales (DATA), Review (sales to match to contacts) and Import.
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const day = (iso: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}/${y.slice(2)}`; };
const stat = (rows: SaleView[]): StatSale[] => rows.map((r) => ({ status: r.status, side: r.side, closeDate: r.closeDate, source: r.source, referredFrom: r.referredFrom, price: r.price, listPrice: r.listPrice, gross: r.gross, net: r.net, commissionPaid: r.commissionPaid }));
type Tab = "dashboard" | "summary" | "list" | "review" | "import";

export function SalesApp({ rows, today, columns, cards }: { rows: SaleView[]; today: string; columns: SaleColumn[]; cards: DashCard[] }) {
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
        {tab === "dashboard" && <Dashboard rows={rows} today={today} cards={cards} />}
        {tab === "summary" && <Summary rows={rows} today={today} />}
        {tab === "list" && <SalesList rows={rows} today={today} columns={columns} />}
        {tab === "review" && <Review rows={review} />}
        {tab === "import" && <Import />}
      </div>
    </div>
  );
}

type SumKey = "key" | "deals" | "pending" | "volume" | "avgPrice" | "listVolume" | "netPct" | "gross" | "grossPct" | "net" | "splitPct";
type SumRow = Totals & { pending: number; pendingVolume: number };
const SUM_COLS: [SumKey, string, boolean][] = [["key", "", false], ["deals", "Deals", false], ["pending", "Pending", false], ["volume", "Volume", false], ["avgPrice", "Avg sale price", false], ["listVolume", "List price", true],
  ["netPct", "Sale/list", true], ["gross", "Gross commission", false], ["grossPct", "Gross %", false], ["net", "Commission", false], ["splitPct", "Split %", false]];
const BY_LABEL: Record<SummaryBy, string> = { year: "Year", quarter: "Quarter", month: "Month" };

/** The master file's SUMMARY tab, by year, quarter or month; click a heading to sort (the total row stays last). */
function Summary({ rows, today }: { rows: SaleView[]; today: string }) {
  const all = useMemo(() => stat(rows), [rows]);
  const years = useMemo(() => saleYears(all, today), [all, today]); // every year with a sale, pending included
  const [by, setBy] = useState<SummaryBy>("year");
  const [onlyYear, setOnlyYear] = useState(0); // 0 = every year
  const [sort, setSort] = useState<{ key: SumKey; desc: boolean }>({ key: "key", desc: false });
  const sortBy = (key: SumKey) => setSort((s) => s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "key" });
  const pickBy = (b: SummaryBy) => { setBy(b); if (b !== "year" && !onlyYear) setOnlyYear(Number(today.slice(0, 4))); if (b === "year") setOnlyYear(0); };
  const show = (k: SumKey, y: SumRow) => k === "pending" ? (y.pending ? `${y.pending} · ${$(y.pendingVolume)}` : "—") : k === "deals" ? y.deals : k === "netPct" || k === "grossPct" ? pct(y[k]) : k === "splitPct" ? `${Math.round(y.splitPct)}%` : k === "key" ? "" : $(y[k]);
  const table = (title: string, side?: "buyer" | "seller") => {
    const s = summaryBy(all, by, side, onlyYear || undefined);
    const cols = SUM_COLS.filter(([, , sideOnly]) => !sideOnly || side);
    const list = [...s.rows].sort((a, b) => { const c = sort.key === "key" ? a.key.localeCompare(b.key) : a[sort.key] - b[sort.key]; return sort.desc ? -c : c; });
    const totalLabel = onlyYear ? `${onlyYear} TOTAL` : "CAREER";
    return (
      <section className="card overflow-x-auto">
        <h2 className="border-b border-misty px-3 py-2 font-bold">{title}</h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs muted">
            {cols.map(([k, l], i) => (
              <th key={k} className={`py-1 ${i === 0 ? "px-3" : ""} ${i === cols.length - 1 ? "pr-3" : ""}`} aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" className="font-semibold hover:underline" onClick={() => sortBy(k)}>{k === "key" ? BY_LABEL[by] : l}{sort.key === k && <span aria-hidden> {sort.desc ? "▼" : "▲"}</span>}</button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {!list.length && <tr><td colSpan={cols.length} className="px-3 py-2 muted">No closed sales.</td></tr>}
            {[...list.map((y) => ({ k: y.label, total: false, ...y })), { k: totalLabel, total: true, ...s.total }].map((y) => (
              <tr key={y.k} className={`border-t border-misty/60 ${y.total ? "bg-sunken font-bold" : ""}`}>
                {cols.map(([k], i) => <td key={k} className={`py-1 ${i === 0 ? "px-3" : ""} ${i === cols.length - 1 ? "pr-3" : ""}`}>{k === "key" ? y.k : show(k, y)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Show by</span>
        {(["year", "quarter", "month"] as SummaryBy[]).map((b) => (
          <button key={b} type="button" aria-pressed={by === b} onClick={() => pickBy(b)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${by === b ? "border-accent bg-accent text-white" : "border-misty bg-white hover:bg-sunken"}`}>{BY_LABEL[b]}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold">Years
          <select className="input w-auto py-1" value={onlyYear} onChange={(e) => setOnlyYear(Number(e.target.value))}>
            <option value={0}>Every year</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      {table("Total")}{table("Buyer transactions", "buyer")}{table("Seller transactions", "seller")}
    </div>
  );
}

/** The master file's DATA tab: every sale, filterable and editable. */
// All sales columns: how each one shows, sorts and aligns (owner request 2026-11-22: sort by any column, pick which show).
const NUM: SaleColumn[] = ["price", "listPrice", "contributions", "commissionPct", "gross", "fees", "net", "splitPct"];
const STATUS_ORDER: Record<string, number> = { pending: 0, closed: 1, fell_through: 2 };
function sortValue(r: SaleView, k: SaleColumn): string | number {
  switch (k) {
    case "client": return (r.clientName || r.people[0]?.name || "").toLowerCase();
    case "closeDate": return r.closeDate ?? "9999";
    case "status": return STATUS_ORDER[r.status] ?? 9;
    case "commissionPaid": return r.status === "closed" ? (r.commissionPaid ? 1 : 0) : 2;
    default: { const v = r[k]; return typeof v === "number" ? v : String(v ?? "").toLowerCase(); }
  }
}
function cell(r: SaleView, k: SaleColumn) {
  switch (k) {
    case "client": return <><b>{r.clientName || "—"}</b>{r.people.length > 0 && <span className="block text-xs">{r.people.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link href={`/people/${p.id}`} className="text-accent hover:underline">{p.name}</Link></span>)}</span>}
      {r.review && <span className="block text-xs text-[#9a6400]">needs a contact (Review)</span>}</>;
    case "address": return <>{r.address}<span className="block text-xs muted">{[r.city, r.zip].filter(Boolean).join(" ")}</span></>;
    case "closeDate": return day(r.closeDate);
    case "side": return r.side === "buyer" ? "Buyer" : "Seller";
    case "status": return <><span className={`rounded-full px-2 text-xs font-semibold ${r.status === "closed" ? "bg-accent-soft text-accent" : r.status === "pending" ? "bg-[#e3ecf7] text-[#24507a]" : "bg-sunken"}`}>{STATUS_LABEL[r.status]}</span>{r.paId && <span className="block text-[10px] muted">from HQ contract</span>}</>;
    case "commissionPct": return r.commissionPct ? pct(r.commissionPct) : "—";
    case "splitPct": return r.splitPct ? `${Math.round(r.splitPct)}%` : "—";
    case "commissionPaid": return r.status === "closed" ? (r.commissionPaid ? "Yes" : "No") : "—";
    case "price": case "listPrice": case "contributions": case "gross": case "fees": case "net": return $(r[k]);
    default: return <span className="text-xs">{r[k]}</span>;
  }
}
const LABEL = Object.fromEntries(SALE_COLUMNS) as Record<SaleColumn, string>;

function SalesList({ rows, today, columns }: { rows: SaleView[]; today: string; columns: SaleColumn[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [side, setSide] = useState("all");
  const [editing, setEditing] = useState<SaleView | "new" | null>(null);
  const [sort, setSort] = useState<{ key: SaleColumn; desc: boolean }>({ key: "closeDate", desc: true });
  const [picking, setPicking] = useState(false);
  const years = [...new Set(rows.map((r) => r.closeDate?.slice(0, 4)).filter((y): y is string => !!y))].sort().reverse();
  const filtered = rows.filter((r) => (year === "all" || r.closeDate?.startsWith(year)) && (status === "all" || r.status === status) && (side === "all" || r.side === side)
    && (!q.trim() || `${r.clientName} ${r.address} ${r.city} ${r.referredFrom} ${r.people.map((p) => p.name).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())));
  const shown = [...filtered].sort((a, b) => {
    const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -c : c;
  });
  const sortBy = (key: SaleColumn) => setSort((s) => s.key === key ? { key, desc: !s.desc } : { key, desc: NUM.includes(key) || key === "closeDate" });
  const sel = "input w-auto py-1 text-sm";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full py-1 text-sm sm:w-64" placeholder="Find a client, address or referral" aria-label="Find a sale" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select className={sel} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Any status</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={sel} aria-label="Side" value={side} onChange={(e) => setSide(e.target.value)}><option value="all">Buyer & seller</option><option value="buyer">Buyer</option><option value="seller">Seller</option></select>
        <span className="text-sm muted">{shown.length} sales · {$(shown.reduce((a, r) => a + r.price, 0))}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn text-sm" aria-expanded={picking} onClick={() => setPicking(!picking)}>Columns</button>
          <button type="button" className="btn btn-primary text-sm" onClick={() => setEditing("new")}>+ Add a sale</button>
        </span>
      </div>
      {picking && <ColumnPicker columns={columns} onDone={() => { setPicking(false); router.refresh(); }} />}
      {editing && <SaleEditor sale={editing === "new" ? null : editing} today={today} onDone={() => setEditing(null)} />}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: `${Math.max(600, columns.length * 85)}px` }}>
          <thead className="bg-sunken text-left text-xs"><tr>
            {columns.map((k, i) => (
              <th key={k} className={`${NUM.includes(k) ? "text-right" : ""} ${i === 0 ? "px-2" : "px-1"} py-1.5`} aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" className="font-semibold hover:underline" onClick={() => sortBy(k)} title={`Sort by ${LABEL[k]}`}>
                  {LABEL[k]}{sort.key === k && <span aria-hidden> {sort.desc ? "▼" : "▲"}</span>}
                </button>
              </th>
            ))}
            <th></th>
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-misty/60 align-top hover:bg-paper">
                {columns.map((k, i) => (
                  <td key={k} className={`${NUM.includes(k) ? "text-right" : ""} ${i === 0 ? "px-2" : "px-1"} py-1 ${k === "commissionPaid" && r.status === "closed" && !r.commissionPaid ? "font-bold text-[#9a6400]" : ""}`}>{cell(r, k)}</td>
                ))}
                <td className="pr-2 py-1"><button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(r)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-sm muted">No sales match.</p>}
      </div>
    </div>
  );
}

/** Pick which All sales columns show (saved for the owner; Client always shows). */
function ColumnPicker({ columns, onDone }: { columns: SaleColumn[]; onDone: () => void }) {
  const [on, setOn] = useState<Set<SaleColumn>>(new Set(columns));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const flip = (k: SaleColumn) => { const n = new Set(on); if (n.has(k)) n.delete(k); else n.add(k); setOn(n); };
  const save = (cols: SaleColumn[]) => start(async () => { setError(""); const r = await saveColumnsAction(cols); if (!r.ok) { setError(r.error); return; } onDone(); });
  return (
    <div className="card mt-3 p-3">
      <p className="text-sm font-semibold">Columns to show</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {SALE_COLUMNS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={k === "client" || on.has(k)} disabled={k === "client"} onChange={() => flip(k)} />{l}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={() => save([...on])}>Save</button>
        <button type="button" className="btn text-sm" disabled={pending} onClick={onDone}>Cancel</button>
        <button type="button" className="btn text-sm muted" disabled={pending} onClick={() => save(DEFAULT_SALE_COLUMNS)}>Back to the usual columns</button>
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
