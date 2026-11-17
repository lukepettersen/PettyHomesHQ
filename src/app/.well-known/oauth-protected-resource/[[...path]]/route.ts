import { baseUrl } from "@/server/mcp";
import { SCOPE } from "@/lib/mcp";

// Claude app connector: tells Claude where to sign in for /api/mcp (OAuth protected resource metadata).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = baseUrl(req);
  return Response.json({ resource: `${base}/api/mcp`, authorization_servers: [base], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_name: "Petty Homes HQ" });
}
