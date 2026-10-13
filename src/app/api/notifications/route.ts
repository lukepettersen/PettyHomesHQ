import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { loadBell } from "@/server/notifications";

export const dynamic = "force-dynamic";

/** Polled by the bell so new mentions show up without reloading. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json(await loadBell(id), { headers: { "Cache-Control": "no-store" } });
}
