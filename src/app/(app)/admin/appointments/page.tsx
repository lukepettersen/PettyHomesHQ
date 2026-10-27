import { adminGate } from "../gate";
import { loadApptTypes } from "@/server/appointments";
import { ApptTypesClient } from "./ApptTypesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  return (
    <>
      <h1 className="text-2xl font-extrabold">Appointment types</h1>
      <p className="mb-4 mt-1 text-sm muted">
        What <b>+ Book</b> on a contact offers, and how long each one starts out. The first five are built in: a phone call and the consults start task templates, so they can be renamed and resized but not removed. Your own types book like &quot;Appointment&quot; and go on Google Calendar the same way.
      </p>
      <ApptTypesClient types={await loadApptTypes()} />
    </>
  );
}
