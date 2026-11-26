import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { getFile, storageConnected } from "@/server/storage";

export const dynamic = "force-dynamic";

/** A contact's photo from their Files card, served from HQ itself so Make post can draw it (owner request 2026-11-26).
 *  Signed in only; images only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Sign in first", { status: 401 });
  if (!storageConnected()) return new Response("File storage isn't connected.", { status: 400 });
  const { id } = await params;
  const doc = await db.document.findFirst({ where: { id, deletedAt: null, person: { deletedAt: null } } });
  if (!doc || !/^image\/(png|jpe?g|webp|gif)$/i.test(doc.contentType)) return new Response("Not an image", { status: 404 });
  const body = await getFile(doc.key);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": doc.contentType, "Cache-Control": "private, max-age=600" } });
}
