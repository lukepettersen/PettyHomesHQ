import { requireUser } from "@/server/auth";
import { hasPermission, type Permission } from "@/server/permissions";

/** Each Admin page checks its own permission on the server; returns a message to show instead, or null. */
export async function adminGate(perm: Permission = "manageUsers") {
  const user = await requireUser();
  if (hasPermission(user.permissions, perm)) return null;
  return (
    <div className="card p-6">
      <h1 className="text-xl font-extrabold">Admin</h1>
      <p className="mt-1 text-sm muted">Only an Admin can change these settings. Ask Luke if something needs updating.</p>
    </div>
  );
}
