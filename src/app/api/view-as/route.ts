import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions, VIEW_AS_COOKIE } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** "View as" (owner request 2026-11-26): ?user=<id> starts seeing HQ as that teammate (owner only); ?stop=1 goes back.
 *  Look-only: actions refuse while it's on (guarded), and calls / pop-ups stay off. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const home = (p: string) => new Response(null, { status: 303, headers: { Location: p } });
  if (url.searchParams.get("stop")) { jar.delete(VIEW_AS_COOKIE); return home(url.searchParams.get("back")?.startsWith("/") ? url.searchParams.get("back")! : "/settings"); }
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; isOwner?: boolean; viewAsBy?: string | null } | undefined;
  if (!me?.id) return home("/login");
  if (!me.isOwner && !me.viewAsBy) return new Response("Only the owner can do that.", { status: 403 });
  const id = url.searchParams.get("user") ?? "";
  const t = await db.user.findFirst({ where: { id, status: { not: "DISABLED" } }, select: { id: true, isOwner: true } });
  if (!t || t.isOwner) return home("/settings");
  jar.set(VIEW_AS_COOKIE, t.id, { path: "/", httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", maxAge: 60 * 60 * 8 });
  return home("/tasks");
}
