import { adminGate } from "../gate";
import { loadFileForm, loadStatuses } from "@/server/files";
import { FileFormsClient } from "./FileFormsClient";
import { DealQuestionTabs } from "../DealQuestionTabs";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [buyer, listing, statuses] = await Promise.all([loadFileForm("buyer"), loadFileForm("listing"), loadStatuses()]);
  return (
    <>
      <DealQuestionTabs on="files" />
      <p className="mb-4 text-sm muted">
        The questions asked when you start or edit a buyer or a seller (listing). Each section can show at every status or only some.
        Questions marked &quot;Used by automations&quot; feed the Pipeline cards, commission, contracts or templates.
      </p>
      <FileFormsClient forms={{ buyer, listing }} statuses={{ buyer: statuses.buyer, listing: statuses.listing }} />
    </>
  );
}
