import { requireUser } from "@/server/auth";
import { loadTaskBoard } from "@/server/tasks";
import { TasksApp } from "./TasksApp";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, board, sp] = await Promise.all([requireUser(), loadTaskBoard(), searchParams]);
  const views = new Set(["today", ...board.lists.map((l) => l.builtin ?? `list:${l.id}`)]);
  const view = sp.view && views.has(sp.view) ? sp.view : "today";
  const whoOk = sp.who === "everyone" || sp.who === "me" || board.team.some((m) => m.id === sp.who);
  // The owner sees everyone's tasks by default; everyone else starts on their own.
  const who = whoOk ? sp.who! : user.isOwner ? "everyone" : "me";
  return <TasksApp {...board} meId={user.id} initialView={view} initialWho={who} initialTask={sp.task ?? null} />;
}
