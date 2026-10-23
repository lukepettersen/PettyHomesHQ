import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { fetchTextMedia } from "@/server/twilio";
import type { TextMedia } from "@/lib/textMedia";

export const dynamic = "force-dynamic";

/** A photo on a text, for signed-in users only: HQ's own uploads directly, received ones passed through from Twilio. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Sign in first", { status: 401 });
  const { id, n } = await params;
  const msg = await db.textMessage.findUnique({ where: { id }, select: { media: true } });
  const m = (Array.isArray(msg?.media) ? (msg!.media as TextMedia[]) : [])[Number(n)];
  if (!m) return new Response("Not found", { status: 404 });
  if (m.url && m.url.includes("/api/img/")) return Response.redirect(m.url, 302);
  const r = await fetchTextMedia(m);
  if (!r || !r.ok) return new Response("The photo isn't available from Twilio right now.", { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": r.headers.get("content-type") ?? m.type ?? "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}
