import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { baseUrl, checkAuthRequest, issueCode, type AuthRequest } from "@/server/mcp";

// Claude app connector: the page Claude opens to sign in. You must be signed in to HQ as the owner and press Allow;
// then HQ sends a one-time code back to Claude's own callback address (no other address is accepted).
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · HQ</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f4;color:#2b2b2b;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.card{background:#fff;border:1px solid #dfe3dc;border-radius:12px;max-width:420px;width:100%;padding:28px;box-shadow:0 1px 2px #0001}
h1{font-size:20px;margin:0 0 8px}p,li{font-size:14px;line-height:1.45}ul{padding-left:20px}.row{display:flex;gap:8px;margin-top:20px}
button{flex:1;border-radius:8px;padding:10px;font-weight:700;font-size:15px;cursor:pointer;border:1px solid #c9cfc4;background:#fff}
button.go{background:#4f6b4a;color:#fff;border-color:#4f6b4a}button:focus-visible{outline:3px solid #9bb894;outline-offset:2px}.muted{color:#6b6b6b;font-size:13px}</style></head>
<body><main class="card">${body}</main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" } });
}

const readReq = (p: URLSearchParams): AuthRequest => ({
  clientId: p.get("client_id") ?? "", redirectUri: p.get("redirect_uri") ?? "", state: p.get("state") ?? "",
  challenge: p.get("code_challenge") ?? "", method: p.get("code_challenge_method") ?? "", responseType: p.get("response_type") ?? "",
});

function back(r: AuthRequest, q: Record<string, string>) {
  const u = new URL(r.redirectUri);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  if (r.state) u.searchParams.set("state", r.state);
  return new Response(null, { status: 303, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
}

async function owner() {
  const s = await getServerSession(authOptions);
  const u = s?.user as { id?: string; name?: string; isOwner?: boolean } | undefined;
  return u?.id ? { id: u.id, name: u.name ?? "", isOwner: !!u.isOwner } : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = readReq(url.searchParams);
  const check = await checkAuthRequest(r);
  if (!check.ok) return check.page ? page("Can't connect", `<h1>Can't connect</h1><p>${esc(check.page)}</p>`, 400) : back(r, { error: check.redirectError! });
  const me = await owner();
  if (!me) {
    const here = `/api/mcp/authorize${url.search}`;
    return new Response(null, { status: 303, headers: { Location: `${baseUrl(req)}/login?callbackUrl=${encodeURIComponent(here)}` } });
  }
  if (!me.isOwner) return page("Owner only", "<h1>Owner only</h1><p>Only the owner can connect Claude to HQ for now.</p>", 403);
  const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "response_type"]
    .map((k) => `<input type="hidden" name="${k}" value="${esc(url.searchParams.get(k) ?? "")}">`).join("");
  return page("Connect Claude", `<h1>Connect ${esc(check.clientName)} to HQ?</h1>
<p>Signed in as ${esc(me.name)}. Claude will be able to:</p>
<ul><li>Look up your contacts, deals and schedule</li><li>Read the texts on your HQ number</li><li>Send texts from your HQ number</li><li>Add tasks, notes and contacts</li></ul>
<p class="muted">You can disconnect any time in HQ → My settings.</p>
<form method="post" action="/api/mcp/authorize">${hidden}<div class="row">
<button type="submit" name="decision" value="deny">Cancel</button><button class="go" type="submit" name="decision" value="allow">Allow</button></div></form>`);
}

export async function POST(req: Request) {
  // Only HQ's own page can press Allow (the session cookie is SameSite=Lax; this checks the page's address too).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(baseUrl(req)).origin) return page("Can't connect", "<h1>Can't connect</h1><p>That didn't come from HQ.</p>", 403);
  const form = new URLSearchParams(await req.text());
  const r = readReq(form);
  const check = await checkAuthRequest(r);
  if (!check.ok) return check.page ? page("Can't connect", `<h1>Can't connect</h1><p>${esc(check.page)}</p>`, 400) : back(r, { error: check.redirectError! });
  const me = await owner();
  if (!me?.isOwner) return page("Owner only", "<h1>Owner only</h1><p>Only the owner can connect Claude to HQ for now.</p>", 403);
  if (form.get("decision") !== "allow") return back(r, { error: "access_denied" });
  return back(r, { code: await issueCode(me.id, r) });
}
