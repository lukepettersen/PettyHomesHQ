import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { logActivity } from "@/server/activity";
import { connectWithCode, redirectUri } from "@/server/google";

export const dynamic = "force-dynamic";

/** Google sends the Admin back here after approving; the one-time code becomes a stored (encrypted) connection. */
export async function GET(req: Request) {
  const back = (result: string) => new Response(null, {
    status: 302,
    headers: { Location: new URL(`/admin/integrations?google=${result}`, redirectUri()).toString(), "Set-Cookie": "hq_google_state=; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0" },
  });
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || !hasPermission(user.permissions, "manageUsers")) return back("denied");
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const cookie = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith("hq_google_state="))?.slice("hq_google_state=".length) ?? "";
  if (!state || state !== cookie) return back("expired");
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back("error");
  try {
    const email = await connectWithCode(code, user.id);
    await logActivity(user.id, "update", "integration", "google-calendar", `Connected Google Calendar${email ? ` (${email})` : ""}`);
    return back("connected");
  } catch (e) {
    console.error("Google Calendar: connect failed", e instanceof Error ? e.message : "unknown");
    return back("error");
  }
}
