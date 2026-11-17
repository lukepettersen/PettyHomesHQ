import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { syncGmail } from "@/server/google";

export const dynamic = "force-dynamic";

/** Brings new Gmail emails onto timelines. Any signed-in tab calls this; it runs at most every 3 minutes. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json({ added: await syncGmail() }, { headers: { "Cache-Control": "no-store" } });
}
