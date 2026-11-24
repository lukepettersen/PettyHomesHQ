import { cookies } from "next/headers";
import { requireUser } from "@/server/auth";
import { loadTaskBoard } from "@/server/tasks";
import { db } from "@/server/db";
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
  // Card envelopes' return address: saved, else "Petty Homes" and the mailing address used on mass emails.
  const [ret, mail] = await Promise.all([db.appSetting.findUnique({ where: { key: "cards.returnAddress" } }), db.appSetting.findUnique({ where: { key: "email.mailingAddress" } })]);
  const fromMail = typeof mail?.value === "string" && mail.value.trim() ? ["Petty Homes", ...mail.value.split(",").map((x) => x.trim()).filter(Boolean).reduce<string[]>((a, x, i, all) => (i === 0 ? [x] : i === 1 ? [...a, all.slice(1).join(", ")] : a), [])].join("\n") : "Petty Homes";
  const returnAddress = typeof ret?.value === "string" ? ret.value : fromMail;
  return <TasksApp {...board} returnAddress={returnAddress} meId={user.id} initialView={view} initialWho={who} initialTask={sp.task ?? null} />;
}
