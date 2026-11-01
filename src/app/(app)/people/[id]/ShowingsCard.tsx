import Link from "next/link";

type Row = { id: string; address: string; when: string; status: string; seller: { id: string; name: string } | null; total: number | null };

const STATUS: Record<string, [string, string]> = {
  confirmed: ["Confirmed", "bg-accent-soft text-accent"], shown: ["Shown", "bg-sunken text-muted"],
  cancelled: ["Cancelled", "bg-[#f7e2de] text-bad"], rescheduled: ["Moved", "bg-[#f6efd9] text-[#7a5d12]"],
};

/** Showings this agent booked on our listings, from ShowingTime's emails (owner request 2026-11-01). */
export function ShowingsCard({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const listings = new Set(rows.map((r) => r.address)).size;
  return (
    <section className="card p-4" aria-labelledby="showings-h">
      <div className="flex items-baseline justify-between">
        <h2 id="showings-h" className="text-lg font-bold">Showings</h2>
        <span className="text-xs muted">{rows.length} · {listings} {listings === 1 ? "listing" : "listings"}</span>
      </div>
      <ul className="mt-1">
        {rows.map((r) => {
          const [label, cls] = STATUS[r.status] ?? STATUS.confirmed;
          return (
            <li key={r.id} className="border-t border-misty/60 py-2 text-sm first:border-0">
              <div className="flex items-start justify-between gap-2"><b className="min-w-0">{r.address.replace(/,\s*MN\s*\d{5}$/, "")}</b><span className={`flex-none rounded-full px-2 text-xs font-semibold ${cls}`}>{label}</span></div>
              <div>{r.when}</div>
              {(r.seller || r.total) && <div className="text-xs muted">{r.seller && <>Seller: <Link href={`/people/${r.seller.id}`} className="underline hover:text-charcoal">{r.seller.name}</Link></>}{r.seller && r.total ? " · " : ""}{r.total ? `Showing ${r.total} on this listing` : ""}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
