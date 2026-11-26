import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import { loadBell } from "@/server/notifications";
import { unreadCount } from "@/server/texting";
import { TopBar } from "@/components/TopBar";
import { AlarmCenter } from "@/components/AlarmCenter";
import { CallCenter } from "@/components/CallCenter";
import { GmailSync } from "@/components/GmailSync";
import { SoundPrefsInit } from "@/components/SoundPrefsInit";
import { loadAlertPrefs, loadSoundPrefs } from "@/server/sounds";
import { isConnected } from "@/server/integrations";
import { NAV_KEY, navOrder } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [tools, bell, texts, nav, sounds] = await Promise.all([db.toolLink.findMany({ orderBy: { position: "asc" } }), loadBell(user.id), unreadCount(user.id), db.appSetting.findUnique({ where: { key: NAV_KEY } }), loadSoundPrefs(user.id)]);
  const alerts = await loadAlertPrefs(user.id);
  return (
    <>
      {user.viewAsBy && (
        // "View as" banner (owner request 2026-11-26): always visible, one click back.
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-[#24507a] px-4 py-1.5 text-sm text-white">
          <span>You&apos;re seeing HQ as <b>{user.name}</b>. Look only: nothing can be changed or sent.</span>
          <a href="/api/view-as?stop=1" className="rounded-full bg-white px-3 py-0.5 font-semibold text-[#24507a] hover:bg-sunken">Back to my view</a>
        </div>
      )}
      <TopBar name={user.name} tools={tools.map((t) => ({ name: t.name, url: t.url }))} canEditTools={hasPermission(user.permissions, "manageUsers")} bell={bell} texts={texts} claude={isConnected("claude")} owner={user.isOwner} order={navOrder(nav?.value)} />
      {children}
      <AlarmCenter />
      <CallCenter />
      <GmailSync />
      <SoundPrefsInit prefs={sounds} alerts={alerts} />
    </>
  );
}
