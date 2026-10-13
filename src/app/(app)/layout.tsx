import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import { loadBell } from "@/server/notifications";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [tools, bell] = await Promise.all([db.toolLink.findMany({ orderBy: { position: "asc" } }), loadBell(user.id)]);
  return (
    <>
      <TopBar name={user.name} tools={tools.map((t) => ({ name: t.name, url: t.url }))} canEditTools={hasPermission(user.permissions, "manageUsers")} bell={bell} />
      {children}
    </>
  );
}
