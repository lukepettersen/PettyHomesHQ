import { keyMatches, receiveLead } from "@/server/leads";
import { readLead } from "@/lib/leads";

// The website's lead form posts here (Elementor Pro → Actions After Submit → Webhook). Outside sign-in; the link's
// secret key is checked instead. It can only add a lead. Form contents aren't logged.

export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key || !(await keyMatches(key))) return Response.json({ error: "Not allowed" }, { status: 403 });
  const text = await req.text();
  if (text.length > 50_000) return Response.json({ error: "Too big" }, { status: 413 });
  let raw: Record<string, string> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("json")) {
      const j = JSON.parse(text) as Record<string, unknown>;
      raw = Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)]));
    } else raw = Object.fromEntries(new URLSearchParams(text));
  } catch { return Response.json({ error: "Couldn't read the form" }, { status: 400 }); }
  const lead = readLead(raw);
  if (!lead.name && !lead.email && !lead.phone) return Response.json({ error: "No name, email or phone in the form" }, { status: 400 });
  try {
    const r = await receiveLead(lead);
    return Response.json({ ok: true, created: r.created });
  } catch (e) {
    console.error("Website lead failed:", e instanceof Error ? e.name : "error");
    return Response.json({ error: "HQ couldn't save it" }, { status: 500 });
  }
}
