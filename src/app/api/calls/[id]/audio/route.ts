import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { isConnected } from "@/server/integrations";
import { fetchRecording } from "@/server/twilio";

export const dynamic = "force-dynamic";

/** Play a call recording: checks the session, then passes the audio through from Twilio (never a public link). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Sign in first", { status: 401 });
  if (!isConnected("texting")) return new Response("Twilio isn't connected.", { status: 400 });
  const { id } = await params;
  const call = await db.phoneCall.findUnique({ where: { id }, select: { recordingSid: true, personId: true } });
  if (!call?.recordingSid) return new Response("No recording for that call.", { status: 404 });
  if (call.personId && !(await db.person.findFirst({ where: { id: call.personId, deletedAt: null }, select: { id: true } }))) return new Response("That person was deleted.", { status: 404 });
  const r = await fetchRecording(call.recordingSid, req.headers.get("range")).catch(() => null);
  if (!r || (!r.ok && r.status !== 206)) return new Response("The recording isn't ready yet, or Twilio couldn't be reached. Try again in a minute.", { status: 502 });
  const headers = new Headers({ "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "Accept-Ranges": "bytes" });
  for (const h of ["content-length", "content-range"]) { const v = r.headers.get(h); if (v) headers.set(h, v); }
  return new Response(r.body, { status: r.status, headers });
}
