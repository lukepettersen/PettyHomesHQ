import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { textingEnabled } from "@/server/integrations";
import { voiceTokenFor } from "@/server/voice";

export const dynamic = "force-dynamic";

/** Browser calling: a token for the signed-in team member, if they have an HQ number and texting is on. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const user = await db.user.findFirst({ where: { id, status: { not: "DISABLED" } }, select: { textNumber: true } });
  if (!user?.textNumber || !(await textingEnabled())) return Response.json({ off: true });
  try { return Response.json({ token: await voiceTokenFor(id), number: user.textNumber }); }
  catch (e) {
    console.error("Browser calling setup failed:", e instanceof Error ? e.message : "unknown");
    return Response.json({ off: true, error: "Calling from HQ couldn't be set up." });
  }
}
