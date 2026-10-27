import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { placesOn, suggestAddresses } from "@/server/places";

export const dynamic = "force-dynamic";

/** Address suggestions as you type (signed in only). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const u = new URL(req.url);
  if (!placesOn()) return Response.json({ off: true, results: [] });
  const r = await suggestAddresses((u.searchParams.get("q") ?? "").slice(0, 200), (u.searchParams.get("s") ?? "").slice(0, 60));
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
