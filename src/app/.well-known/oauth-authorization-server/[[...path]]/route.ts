import { baseUrl } from "@/server/mcp";
import { SCOPE } from "@/lib/mcp";

// Claude app connector: HQ's sign-in addresses for Claude (OAuth authorization server metadata).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = baseUrl(req);
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/authorize`,
    token_endpoint: `${base}/api/mcp/token`,
    registration_endpoint: `${base}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  });
}
