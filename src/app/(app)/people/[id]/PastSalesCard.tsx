type Row = { id: string; address: string; date: string | null; side: string; status: string };
const STATUS: Record<string, [string, string]> = { closed: ["Closed", "bg-accent-soft text-accent"], pending: ["Pending", "bg-[#e3ecf7] text-[#24507a]"] };
const day = (iso: string | null) => { if (!iso) return "Closing date not set"; const [y, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}/${y}`; };

/** Deals this contact did with Luke (owner request 2026-11-22): everyone sees it; never any money (no price, commission
 *  or split: src/server/sales.ts loadPersonSales doesn't select them). */
export function PastSalesCard({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const closed = rows.filter((r) => r.status === "closed").length;
  return (
    <section className="card p-4" aria-labelledby="past-sales-h">
      <div className="flex items-baseline justify-between">
        <h2 id="past-sales-h" className="text-lg font-bold">Past Sales</h2>
        <span className="text-xs muted">{closed} {closed === 1 ? "deal" : "deals"} with Luke{rows.length > closed ? ` · ${rows.length - closed} pending` : ""}</span>
      </div>
      <ul className="mt-1">
        {rows.map((r) => {
          const [label, cls] = STATUS[r.status] ?? STATUS.closed;
          return (
            <li key={r.id} className="border-t border-misty/60 py-1.5 text-sm first:border-0">
              <div className="flex items-start justify-between gap-2"><b className="min-w-0">{r.address}</b><span className={`flex-none rounded-full px-2 text-xs font-semibold ${cls}`}>{label}</span></div>
              <div className="text-xs muted">{r.side === "seller" ? "Seller" : "Buyer"} · {day(r.date)}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
