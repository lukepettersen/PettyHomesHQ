import { adminGate } from "../gate";
import { loadPaperConfig } from "@/server/paperwork";
import { PaperworkClient } from "./PaperworkClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate("editTaskTemplates");
  if (denied) return denied;
  const cfg = await loadPaperConfig();
  return (
    <>
      <h1 className="text-2xl font-extrabold">Paperwork steps</h1>
      <p className="mb-4 mt-1 text-sm muted">The steps that come with each Request paperwork form. They show as checkboxes on the task, with the deal&apos;s details filled in. Add your own forms here too.</p>
      <PaperworkClient initial={cfg} />
    </>
  );
}
