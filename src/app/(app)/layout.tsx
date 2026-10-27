import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import { loadBell } from "@/server/notifications";
import { unreadCount } from "@/server/texting";
import { TopBar } from "@/components/TopBar";
import { AlarmCenter } from "@/components/AlarmCenter";
import { CallCenter } from "@/components/CallCenter";
import { GmailSync } from "@/components/GmailSync";
import { isConnected } from "@/server/integrations";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [tools, bell, texts] = await Promise.all([db.toolLink.findMany({ orderBy: { position: "asc" } }), loadBell(user.id), unreadCount(user.id)]);
  return (
    <>
      <TopBar name={user.name} tools={tools.map((t) => ({ name: t.name, url: t.url }))} canEditTools={hasPermission(user.permissions, "manageUsers")} bell={bell} texts={texts} claude={isConnected("claude")} />
      {children}
      <AlarmCenter />
      <CallCenter />
      <GmailSync />
    </>
  );
}
