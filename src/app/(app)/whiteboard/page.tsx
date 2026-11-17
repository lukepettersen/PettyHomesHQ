import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { loadBoard } from "@/server/whiteboard";
import { WhiteboardApp } from "./WhiteboardApp";

export const dynamic = "force-dynamic";

/** The owner's private whiteboard (owner request 2026-11-02). Others go to Tasks. */
export default async function WhiteboardPage() {
  const user = await requireUser();
  if (!user.isOwner) redirect("/tasks");
  return <WhiteboardApp initial={await loadBoard(user.id)} />;
}
