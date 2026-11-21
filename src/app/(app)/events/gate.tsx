import { requireUser, type SessionUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";

/** Events pages need the "Events" permission (Admin → Users & permissions). */
export async function eventsGate(): Promise<{ user: SessionUser; denied: React.ReactNode | null }> {
  const user = await requireUser();
  if (hasPermission(user.permissions, "manageEvents")) return { user, denied: null };
  return { user, denied: (
    <div className="mx-auto max-w-2xl px-4 py-8"><h1 className="text-2xl font-extrabold">Events</h1>
      <p className="card mt-4 p-5 text-sm">You don&apos;t have the Events permission. An Admin can turn it on in Admin → Users &amp; permissions.</p></div>
  ) };
}
