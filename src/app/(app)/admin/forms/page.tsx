import { adminGate } from "../gate";
import { loadForm } from "@/server/pa";
import { FormsClient } from "./FormsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [buyer, seller] = await Promise.all([loadForm("buyer"), loadForm("seller")]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Purchase agreement forms</h1>
      <p className="mb-4 mt-1 text-sm muted">The questions asked when adding a purchase agreement. The first section is step 2 of the form; the rest is step 3. Questions marked &quot;Used by automations&quot; feed the Pipeline, calendar or templates.</p>
      <FormsClient forms={{ buyer, seller }} />
    </>
  );
}
