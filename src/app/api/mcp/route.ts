import { baseUrl, callTool, userForToken } from "@/server/mcp";
import { TOOLS, pickVersion, rpcError, rpcResult, type RpcId } from "@/lib/mcp";

// Claude app connector (owner request 2026-11-17; SPEC.md §12): HQ's MCP server (Streamable HTTP, no sessions,
// plain JSON answers). Outside sign-in: every call needs an access token Claude got by signing in as the owner.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INSTRUCTIONS = "Petty Homes HQ is the owner's real estate CRM. Look contacts up with find_people before using their id. " +
  "send_text texts a client from the owner's business number right away: only call it after the owner has seen the exact message and said yes. " +
  "text_owner texts only the owner's own cell (never anyone else), so it needs no approval per text. " +
  "Times are Central (America/Chicago).";

type Msg = { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> };

export async function POST(req: Request) {
  const user = await userForToken(req.headers.get("authorization"));
  if (!user) {
    return Response.json(rpcError(null, -32001, "Sign in to HQ"), { status: 401, headers: {
      "WWW-Authenticate": `Bearer realm="hq", resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`,
    } });
  }
  const text = await req.text();
  if (text.length > 200_000) return Response.json(rpcError(null, -32600, "Too big"), { status: 413 });
  let msg: Msg;
  try { msg = JSON.parse(text) as Msg; } catch { return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 }); }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") return Response.json(rpcError(null, -32600, "Invalid request"), { status: 400 });
  // Notifications and replies get no answer.
  if (msg.id === undefined || !msg.method) return new Response(null, { status: 202 });
  const id = msg.id;
  switch (msg.method) {
    case "initialize":
      return Response.json(rpcResult(id, { protocolVersion: pickVersion(msg.params?.protocolVersion), capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "pettyhomes-hq", title: "Petty Homes HQ", version: "1.0.0" }, instructions: INSTRUCTIONS }));
    case "ping":
      return Response.json(rpcResult(id, {}));
    case "tools/list":
      return Response.json(rpcResult(id, { tools: TOOLS }));
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      return Response.json(rpcResult(id, await callTool(user, name, msg.params?.arguments)));
    }
    default:
      return Response.json(rpcError(id, -32601, "Method not found"));
  }
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
