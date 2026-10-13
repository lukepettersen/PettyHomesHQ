import { adminGate } from "../gate";
import { loadFileForm, loadStatuses } from "@/server/files";
import { FileFormsClient } from "./FileFormsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [buyer, listing, statuses] = await Promise.all([loadFileForm("buyer"), loadFileForm("listing"), loadStatuses()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Buyer &amp; listing forms</h1>
      <p className="mb-4 mt-1 text-sm muted">
        The questions asked when you start or edit a buyer or a listing. Each section can show at every status or only some.
        Questions marked &quot;Used by automations&quot; feed the Pipeline cards, commission, contracts or templates.
      </p>
      <FileFormsClient forms={{ buyer, listing }} statuses={{ buyer: statuses.buyer, listing: statuses.listing }} />
    </>
  );
}
