import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { downloadUrl, storageConnected } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Download: checks the session, then sends the browser to a link that expires in 5 minutes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Sign in first", { status: 401 });
  if (!storageConnected()) return new Response("File storage isn't connected.", { status: 400 });
  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, deletedAt: null, person: { deletedAt: null } } });
  if (!doc) return new Response("That file was deleted.", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: await downloadUrl(doc.key, doc.name), "Cache-Control": "no-store" } });
}
