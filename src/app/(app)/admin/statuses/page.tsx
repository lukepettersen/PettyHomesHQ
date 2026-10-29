import { adminGate } from "../gate";
import { db } from "@/server/db";
import { loadStatuses } from "@/server/files";
import { StatusesClient } from "./StatusesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [statuses, counts] = await Promise.all([
    loadStatuses(),
    db.clientFile.groupBy({ by: ["statusId"], where: { deletedAt: null, closedAt: null, person: { deletedAt: null } }, _count: true }),
  ]);
  const count = Object.fromEntries(counts.map((c) => [c.statusId ?? "", c._count]));
  return (
    <>
      <h1 className="text-2xl font-extrabold">Pipeline stages</h1>
      <p className="mb-4 mt-1 text-sm muted">The stages on the Pipeline board. Renaming a stage moves everyone in it; a stage can&apos;t be deleted while clients are in it.</p>
      <StatusesClient title="Buyer Pipeline" kind="buyer" rows={statuses.buyer} counts={count} />
      <StatusesClient title="Seller Pipeline" kind="listing" rows={statuses.listing} counts={count} />
      <StatusesClient title="Under Contract/Pending Pipeline" kind="uc" rows={statuses.uc} counts={count} />
    </>
  );
}
