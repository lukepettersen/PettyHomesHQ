import { adminGate } from "../gate";
import { db } from "@/server/db";
import { loadAddressImports } from "@/server/addressList";
import { AddressListClient } from "./AddressListClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate("manageUsers");
  if (denied) return denied;
  const [stages, imports] = await Promise.all([db.stage.findMany({ orderBy: { position: "asc" }, select: { name: true } }), loadAddressImports()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Import address list</h1>
      <p className="mb-4 mt-1 text-sm muted">Bring in a spreadsheet of names and addresses, like your holiday card list. People already in HQ are matched, not added twice. You check everything before it saves, and every import can be undone.</p>
      <AddressListClient stages={stages.map((s) => s.name)} imports={imports} />
    </>
  );
}
