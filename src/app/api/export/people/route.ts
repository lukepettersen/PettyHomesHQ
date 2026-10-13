import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import { applyFilters, loadCollections, loadPeopleRows, searchRows } from "@/server/people";
import { parseFilters } from "@/lib/filters";
import { isoFromDate } from "@/lib/normalize";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** CSV of people: selected ids, or the current list/filters/search. Needs "Export data". */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return new Response("Sign in first", { status: 401 });
  if (!hasPermission(user.permissions, "exportData")) return new Response("You don't have permission to export.", { status: 403 });

  const url = new URL(req.url);
  let ids: string[];
  if (url.searchParams.get("ids")) ids = url.searchParams.get("ids")!.split(",").slice(0, 5000);
  else {
    const listId = url.searchParams.get("list");
    const f = url.searchParams.get("f");
    const filters = f ? parseFilters(safeJson(f)) : listId ? (await loadCollections()).flatMap((c) => c.lists).find((l) => l.id === listId)?.filters ?? [] : [];
    ids = searchRows(applyFilters(await loadPeopleRows(), filters), url.searchParams.get("q") ?? "").map((r) => r.id);
  }
  const people = await db.person.findMany({
    where: { id: { in: ids }, deletedAt: null }, orderBy: { name: "asc" },
    include: { stage: true, source: true, assignedTo: true, phones: { orderBy: { position: "asc" } }, emails: { orderBy: { position: "asc" } }, tags: { include: { tag: true } }, dates: true },
  });
  const csv = toCsv([
    ["Name", "Mailing name", "Stage", "Phones", "Emails", "Address", "Tags", "Source", "Referred by", "Assigned to", "Follow-up (days)", "Last contact", "Birthdays", "Homeiversary"],
    ...people.map((p) => [
      p.name, p.mailingName ?? "", p.stage?.name ?? "", p.phones.map((x) => x.number).join("; "), p.emails.map((x) => x.address).join("; "), p.address ?? "",
      p.tags.map((t) => t.tag.name).join("; "), p.source?.name ?? "", p.referredBy ?? "", p.assignedTo?.name ?? "", p.followUpDays ? String(p.followUpDays) : "",
      p.lastContactAt ? isoFromDate(p.lastContactAt) : "",
      p.dates.filter((d) => d.kind === "birthday").map((d) => `${d.whose ? d.whose + " " : ""}${isoFromDate(d.date)}`).join("; "),
      p.dates.find((d) => d.kind === "homeiversary") ? isoFromDate(p.dates.find((d) => d.kind === "homeiversary")!.date) : "",
    ]),
  ]);
  await db.activityLog.create({ data: { userId: user.id, action: "export", entity: "person", summary: `Exported ${people.length} people` } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pettyhomes-people-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return []; } }
