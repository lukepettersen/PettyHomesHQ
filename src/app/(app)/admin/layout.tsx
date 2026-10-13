import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowed = hasPermission(user.permissions, "manageUsers");
  return (
    <div className="mx-auto grid max-w-[1300px] grid-cols-1 gap-5 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <AdminNav />
      <main className="min-w-0">
        {allowed ? children : <div className="card p-6"><h1 className="text-xl font-extrabold">Admin</h1><p className="mt-1 text-sm muted">Only an Admin can change these settings. Ask Luke if something needs updating.</p></div>}
      </main>
    </div>
  );
}
