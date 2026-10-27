import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { noteInbound } from "@/server/textDebug";

export const dynamic = "force-dynamic";

const body = z.object({ state: z.enum(["ready", "error"]), message: z.string().max(200).optional() });

/** HQ's browser phone reports in (ready to ring, or a problem) for Admin → Integrations → troubleshooting. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const v = body.safeParse(await req.json().catch(() => null));
  if (!v.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const user = await db.user.findUnique({ where: { id }, select: { name: true, textNumber: true } });
  if (!user?.textNumber) return new Response(null, { status: 204 });
  const who = user.name.split(" ")[0];
  await noteInbound({ via: "call", to: user.textNumber, call: v.data.state === "ready" ? `${who}'s HQ phone is on (calls ring in HQ)` : `${who}'s HQ phone problem: ${v.data.message ?? "unknown"}` });
  return new Response(null, { status: 204 });
}
