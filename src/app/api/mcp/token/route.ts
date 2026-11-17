import { exchange, OAuthError } from "@/server/mcp";

// Claude app connector: swaps a sign-in code (with PKCE) or a refresh token for an access token.
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 10_000) return Response.json({ error: "invalid_request" }, { status: 413 });
  let f: Record<string, string> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("json")) {
      const j = JSON.parse(text) as Record<string, unknown>;
      f = Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } else f = Object.fromEntries(new URLSearchParams(text));
  } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    return Response.json(await exchange(f), { headers });
  } catch (e) {
    if (e instanceof OAuthError) return Response.json({ error: e.code, error_description: e.message }, { status: 400, headers });
    console.error("Claude connector token failed:", e instanceof Error ? e.name : "error");
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
