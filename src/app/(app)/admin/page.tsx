import Link from "next/link";
import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { db } from "@/server/db";
import { isConnected, textingEnabled } from "@/server/integrations";
import { calendarConnection } from "@/server/google";
import { trashCount } from "@/server/adminHome";
import { visibleGroups, type Can } from "./sections";

export const dynamic = "force-dynamic";

/** Admin home (owner-approved redesign 2026-10-29): every setting in six plain groups, with status at a glance. */
export default async function AdminHome() {
  const user = await requireUser();
  const can: Can = { settings: hasPermission(user.permissions, "manageUsers"), templates: hasPermission(user.permissions, "editTaskTemplates"), trash: hasPermission(user.permissions, "deleteRecords"), messages: hasPermission(user.permissions, "editMessageTemplates"), owner: user.isOwner };
  const [google, texting, trash, templates, checklists, users] = await Promise.all([
    calendarConnection(), textingEnabled(),
    trashCount(),
    db.messageTemplate.count(), db.taskTemplate.count(),
    db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { name: true, role: { select: { name: true } } } }),
  ]);
  const ok = (on: boolean, yes = "Connected", no = "Not connected") => ({ text: on ? yes : no, tone: on ? "ok" : "warn" } as const);
  // What each page says on the right: a status or a count.
  const badge: Record<string, { text: string; tone: "ok" | "warn" | "n" }> = {
    "/admin/trash": { text: String(trash), tone: "n" },
    "/admin/messages": { text: String(templates), tone: "n" },
    "/admin/templates": { text: String(checklists), tone: "n" },
  };
  const connections = [
    { name: "Google", ...ok(!!google) },
    { name: "Texting & calls", ...ok(texting, "On", isConnected("texting") ? "Off" : "Not connected") },
    { name: "File storage", ...ok(isConnected("storage")) },
  ];
  const team = users.map((u) => `${u.name.split(" ")[0]} (${u.role.name.toLowerCase()})`).join(", ");
  const tone = { ok: "bg-accent-soft text-accent", warn: "bg-[#fbefd6] text-[#9a6400]", n: "bg-sunken muted" };

  return (
    <>
      <h1 className="text-2xl font-extrabold">Admin</h1>
      <p className="mt-1 text-sm muted">Settings for HQ. Pick what you want to change.</p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleGroups(can).map((g) => (
          <section key={g.name} className="card p-4">
            <h2 className="flex items-center gap-2 text-[17px] font-bold"><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-base">{g.icon}</span>{g.name}</h2>
            <p className="mb-2 mt-0.5 text-[13px] muted">{g.blurb}</p>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-sunken">
                <span className="min-w-0">
                  <b className="block text-sm">{i.label}</b>
                  <span className="block text-[12.5px] muted">{i.href === "/admin/users" && team ? team : i.desc}</span>
                  {i.href === "/admin/integrations" && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {connections.map((c) => <span key={c.name} className={`rounded-full px-2 py-px text-[11px] font-bold ${tone[c.tone]}`}>{c.name}: {c.text}</span>)}
                    </span>
                  )}
                </span>
                {badge[i.href] ? <span className={`flex-none rounded-full px-2 py-px text-xs font-bold ${tone[badge[i.href].tone]}`}>{badge[i.href].text}</span> : <span aria-hidden="true" className="flex-none font-bold muted">›</span>}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
