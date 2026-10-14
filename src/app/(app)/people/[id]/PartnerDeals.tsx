import Link from "next/link";

const STATE: Record<string, string> = { active: "Under contract", closed: "Closed", fell_through: "Fell through" };

/** On a partner's contact page: every deal they were picked for on a purchase agreement (SPEC.md §6.4). */
export function PartnerDeals({ deals }: { deals: { personId: string; client: string; address: string; state: string; role: string }[] }) {
  return (
    <div className="card p-4">
      <h2 className="mb-2 font-bold">Deals <span className="text-sm font-normal muted">{deals.length}</span></h2>
      <ul className="flex flex-col gap-2 text-sm">
        {deals.map((d, i) => (
          <li key={i}>
            <Link href={`/people/${d.personId}`} className="font-semibold text-accent hover:underline">{d.client}</Link>
            <span className="block muted">{d.address.split(",")[0]} · {d.role} · {STATE[d.state] ?? d.state}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
