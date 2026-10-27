import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Pages check their own permission (see gate.tsx); the menu shows what this person can open.
  const can = { settings: hasPermission(user.permissions, "manageUsers"), templates: hasPermission(user.permissions, "editTaskTemplates"), trash: hasPermission(user.permissions, "deleteRecords"), messages: hasPermission(user.permissions, "editMessageTemplates"), owner: user.isOwner };
  return (
    <div className="mx-auto grid max-w-[1300px] grid-cols-1 gap-5 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <AdminNav can={can} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
