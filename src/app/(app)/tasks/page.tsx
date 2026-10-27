import { cookies } from "next/headers";
import { requireUser } from "@/server/auth";
import { loadTaskBoard } from "@/server/tasks";
import { TasksApp } from "./TasksApp";
import { VIEW_COOKIE, WHO_COOKIE } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, board, sp, jar] = await Promise.all([requireUser(), loadTaskBoard(), searchParams, cookies()]);
  const views = new Set(["today", "upcoming", ...board.lists.map((l) => l.builtin ?? `list:${l.id}`)]);
  const savedView = jar.get(VIEW_COOKIE)?.value;
  const view = sp.view && views.has(sp.view) ? sp.view : !sp.task && savedView && views.has(savedView) ? savedView : "today";
  const valid = (w?: string) => w === "everyone" || w === "me" || board.team.some((m) => m.id === w);
  // The link wins, then the last choice on this device (remembered in a cookie), then the default:
  // the owner sees everyone's tasks; everyone else starts on their own.
  const saved = jar.get(WHO_COOKIE)?.value;
  const who = valid(sp.who) ? sp.who! : valid(saved) ? saved! : user.isOwner ? "everyone" : "me";
  return <TasksApp {...board} meId={user.id} initialView={view} initialWho={who} initialTask={sp.task ?? null} />;
}
