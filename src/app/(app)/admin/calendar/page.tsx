import { adminGate } from "../gate";
import { calendarConnection } from "@/server/google";
import { inviteDateOptions, loadInviteRules } from "@/server/contractInvites";
import { TITLE_FIELDS } from "@/lib/contractInvites";
import { CalendarInvitesClient } from "./CalendarInvitesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [rules, options, cal] = await Promise.all([loadInviteRules(), inviteDateOptions(), calendarConnection()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Calendar invites</h1>
      <p className="mb-4 mt-1 text-sm muted">
        When a purchase agreement is added, these dates go on Google Calendar automatically, with invites. They move when a date changes and disappear when the deal closes or falls through. Partners (lenders, title, other agents) are never invited.
        {!cal && " Google Calendar isn't connected yet, so nothing is sent until it's connected in Admin → Integrations."}
      </p>
      <CalendarInvitesClient rules={rules} options={options} fields={TITLE_FIELDS} connected={!!cal} />
    </>
  );
}
