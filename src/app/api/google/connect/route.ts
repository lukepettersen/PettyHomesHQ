import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { allowedDomain } from "@/server/access";
import { CALENDAR_SCOPE, GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE, googleKeysSet, redirectUri } from "@/server/google";

export const dynamic = "force-dynamic";

/** Admin → Integrations → Connect Google (Calendar and sending Gmail): sends the Admin to Google's approval screen. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return new Response("Sign in first", { status: 401 });
  // ?mine=1: anyone connects their own Gmail so emails they send from HQ go out as them (owner request 2026-10-27).
  const params = new URL(req.url).searchParams;
  const mine = params.get("mine") === "1";
  const back = safeBack(params.get("back"));
  if (!mine && !hasPermission(user.permissions, "manageUsers")) return new Response("Only an Admin can connect Google Calendar.", { status: 403 });
  if (!googleKeysSet()) return Response.redirect(new URL(mine ? `${back}${back.includes("?") ? "&" : "?"}gmail=nokeys` : "/admin/integrations?google=nokeys", redirectUri()), 302);
  const state = `${randomBytes(24).toString("base64url")}${mine ? `.mine.${Buffer.from(back).toString("base64url")}` : ""}`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code", scope: mine ? `${GMAIL_SEND_SCOPE} ${GMAIL_READ_SCOPE}` : `${CALENDAR_SCOPE} ${GMAIL_SEND_SCOPE} ${GMAIL_READ_SCOPE}`, include_granted_scopes: "true",
    access_type: "offline", prompt: "consent", state, hd: allowedDomain(), ...(user.email ? { login_hint: user.email } : {}),
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Set-Cookie": `hq_google_state=${state}; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600` },
  });
}

/** Only a path inside HQ to come back to after Google ("/people/abc"), never another site. */
function safeBack(raw: string | null): string {
  return raw && /^\/[\w\-/?=&%.]*$/.test(raw) && !raw.startsWith("//") ? raw.slice(0, 300) : "/people";
}
