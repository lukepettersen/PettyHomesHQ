import { db } from "@/server/db";

export const dynamic = "force-dynamic";

// A transparent 1×1 GIF.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** The tracking image in a mass email (no sign-in): the first load marks it opened. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.gif$/, "").slice(0, 40);
  if (/^[a-z0-9]{20,40}$/.test(id)) {
    await db.emailTrack.updateMany({ where: { id, openedAt: null }, data: { openedAt: new Date() } }).catch(() => {});
    await db.emailTrack.updateMany({ where: { id }, data: { opens: { increment: 1 } } }).catch(() => {});
  }
  return new Response(new Uint8Array(GIF), { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "Content-Length": String(GIF.length) } });
}
