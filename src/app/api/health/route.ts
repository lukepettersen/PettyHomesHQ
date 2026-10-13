import { db } from "@/server/db";

export const dynamic = "force-dynamic";

// Railway health check. Says whether the app and database are up; reveals nothing else.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
