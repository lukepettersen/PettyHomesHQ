import { registerClient } from "@/server/mcp";
import { UserError } from "@/server/safe";

// Claude app connector: Claude registers itself here before it signs in (only Claude's own callback is accepted).
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 10_000) return Response.json({ error: "invalid_client_metadata" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "invalid_client_metadata", error_description: "Not JSON" }, { status: 400 }); }
  try {
    return Response.json(await registerClient(body), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: "invalid_redirect_uri", error_description: e.message }, { status: 400 });
    console.error("Claude connector sign-up failed:", e instanceof Error ? e.name : "error");
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
