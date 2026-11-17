import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { addressDetails } from "@/server/places";

export const dynamic = "force-dynamic";

/** The full address (with ZIP) for a picked suggestion. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first" }, { status: 401 });
  const u = new URL(req.url);
  const address = await addressDetails(u.searchParams.get("id") ?? "", (u.searchParams.get("s") ?? "").slice(0, 60));
  return Response.json({ address }, { headers: { "Cache-Control": "no-store" } });
}
