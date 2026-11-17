import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { loadThreads } from "@/server/texting";
import { textTeammate } from "@/server/paperwork";
import { answerConfirm, runAssistantTool } from "@/server/textAgent";
import { isGroupKey } from "@/lib/groupText";
import { formatPhone, normalizePhone } from "@/lib/normalize";
import { ACCESS_MINUTES, CODE_MINUTES, REFRESH_DAYS, SCOPE, TOOLS, clampInt, hashToken, pkceOk, redirectAllowed, withDefaults } from "@/lib/mcp";

// Claude app connector (owner request 2026-11-17; SPEC.md §12): HQ as a remote MCP server Claude signs in to with
// OAuth, as the owner only. Tokens are random, kept only as SHA-256 hashes, and Disconnect (My settings) revokes them.
// Message bodies aren't logged.

/** HQ's public address (NEXTAUTH_URL in Railway), without a trailing slash. */
export function baseUrl(req?: Request): string {
  const env = process.env.NEXTAUTH_URL?.trim().replace(/\/+$/, "");
  return env || (req ? new URL(req.url).origin : "http://localhost:3000");
}

const newToken = () => `hq_${randomBytes(32).toString("base64url")}`;
const minutes = (n: number) => new Date(Date.now() + n * 60000);

// ---------- Sign-in (OAuth) ----------

/** Dynamic client registration: Claude registers itself before the first sign-in. */
export async function registerClient(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) throw new UserError("Only Claude can connect to HQ (unknown redirect address).");
  const recent = await db.mcpClient.count({ where: { createdAt: { gte: minutes(-60) } } });
  if (recent >= 30) throw new UserError("Too many sign-up tries; wait an hour.");
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 100) : "Claude";
  const c = await db.mcpClient.create({ data: { name, redirectUris: uris } });
  return { client_id: c.id, client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", client_id_issued_at: Math.floor(c.createdAt.getTime() / 1000) };
}

export type AuthRequest = { clientId: string; redirectUri: string; state: string; challenge: string; method: string; responseType: string };

/** Checks a sign-in request. "page" problems are shown on HQ's page (never sent back to an unknown address). */
export async function checkAuthRequest(r: AuthRequest): Promise<{ ok: true; clientName: string } | { ok: false; page?: string; redirectError?: string }> {
  const client = r.clientId ? await db.mcpClient.findUnique({ where: { id: r.clientId } }) : null;
  if (!client) return { ok: false, page: "This app isn't registered with HQ. Remove the connector in Claude and add it again." };
  const uris = (Array.isArray(client.redirectUris) ? client.redirectUris : []) as string[];
  if (!uris.includes(r.redirectUri) || !redirectAllowed(r.redirectUri)) return { ok: false, page: "This sign-in came from an unknown address, so HQ stopped it." };
  if (r.responseType !== "code" || r.method !== "S256" || !r.challenge) return { ok: false, redirectError: "invalid_request" };
  return { ok: true, clientName: client.name };
}

/** The owner said Allow: a one-time code, good for 5 minutes, sent back to Claude. */
export async function issueCode(userId: string, r: AuthRequest): Promise<string> {
  const code = newToken();
  await db.mcpGrant.create({ data: { clientId: r.clientId, userId, kind: "code", tokenHash: hashToken(code), codeChallenge: r.challenge, redirectUri: r.redirectUri, expiresAt: minutes(CODE_MINUTES) } });
  await logActivity(userId, "create", "mcpGrant", null, "Connected the Claude app to HQ");
  return code;
}

export class OAuthError extends Error { constructor(public code: string, message: string) { super(message); } }

async function issueTokens(clientId: string, userId: string) {
  const access = newToken(), refresh = newToken();
  await db.mcpGrant.createMany({ data: [
    { clientId, userId, kind: "access", tokenHash: hashToken(access), expiresAt: minutes(ACCESS_MINUTES) },
    { clientId, userId, kind: "refresh", tokenHash: hashToken(refresh), expiresAt: minutes(REFRESH_DAYS * 24 * 60) },
  ] });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_MINUTES * 60, refresh_token: refresh, scope: SCOPE };
}

/** The token endpoint: a code (with its PKCE verifier) or a refresh token for a new access token. Refresh tokens are one-use. */
export async function exchange(f: Record<string, string>) {
  const clientId = f.client_id ?? "";
  if (f.grant_type === "authorization_code") {
    const g = await db.mcpGrant.findUnique({ where: { tokenHash: hashToken(f.code ?? "") } });
    if (!g || g.kind !== "code" || g.clientId !== clientId || g.revokedAt || g.expiresAt < new Date()) throw new OAuthError("invalid_grant", "The sign-in code is wrong or expired.");
    if (g.redirectUri !== f.redirect_uri || !pkceOk(f.code_verifier ?? "", g.codeChallenge ?? "")) throw new OAuthError("invalid_grant", "The sign-in code doesn't match.");
    const claim = await db.mcpGrant.updateMany({ where: { id: g.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!claim.count) throw new OAuthError("invalid_grant", "The sign-in code was already used.");
    await ownerOrThrow(g.userId);
    return issueTokens(g.clientId, g.userId);
  }
  if (f.grant_type === "refresh_token") {
    const g = await db.mcpGrant.findUnique({ where: { tokenHash: hashToken(f.refresh_token ?? "") } });
    if (!g || g.kind !== "refresh" || (clientId && g.clientId !== clientId) || g.revokedAt || g.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Sign in to HQ again.");
    const claim = await db.mcpGrant.updateMany({ where: { id: g.id, usedAt: null }, data: { usedAt: new Date(), revokedAt: new Date() } });
    if (!claim.count) throw new OAuthError("invalid_grant", "Sign in to HQ again.");
    await ownerOrThrow(g.userId);
    return issueTokens(g.clientId, g.userId);
  }
  throw new OAuthError("unsupported_grant_type", "Unsupported grant type.");
}

async function ownerOrThrow(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { isOwner: true, status: true } });
  if (!u?.isOwner || u.status === "DISABLED") throw new OAuthError("invalid_grant", "Only the owner can connect Claude to HQ.");
}

/** Who a Bearer token belongs to (the owner), or null when it's missing, wrong, expired or disconnected. */
export async function userForToken(header: string | null): Promise<{ id: string; name: string } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
  if (!token) return null;
  const g = await db.mcpGrant.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!g || g.kind !== "access" || g.revokedAt || g.expiresAt < new Date()) return null;
  const u = await db.user.findUnique({ where: { id: g.userId }, select: { id: true, name: true, isOwner: true, status: true } });
  if (!u?.isOwner || u.status === "DISABLED") return null;
  if (!g.lastUsedAt || g.lastUsedAt < minutes(-5)) await db.mcpGrant.update({ where: { id: g.id }, data: { lastUsedAt: new Date() } });
  return { id: u.id, name: u.name };
}

/** My settings: is Claude connected, and when did it last do something. */
export async function connectorStatus(userId: string) {
  const live = await db.mcpGrant.findFirst({ where: { userId, kind: "refresh", revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  const used = await db.mcpGrant.findFirst({ where: { userId, kind: "access", lastUsedAt: { not: null } }, orderBy: { lastUsedAt: "desc" }, select: { lastUsedAt: true } });
  return { connected: !!live, lastUsedAt: live ? used?.lastUsedAt?.toISOString() ?? null : null };
}

/** Disconnect: every code and token stops working right away. */
export async function disconnect(userId: string) {
  const r = await db.mcpGrant.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logActivity(userId, "delete", "mcpGrant", null, "Disconnected the Claude app from HQ");
  return r.count;
}

// ---------- Tools ----------

type Text = { content: { type: "text"; text: string }[]; isError?: boolean };
const say = (text: string, isError = false): Text => ({ content: [{ type: "text", text }], ...(isError ? { isError } : {}) });

async function myNumber(userId: string) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { textNumber: true } });
  if (!me?.textNumber) throw new UserError("You don't have an HQ texting number yet (Admin → Integrations).");
  return me.textNumber;
}

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Runs one connector tool for the owner. Errors the owner can act on come back as the tool's answer. */
export async function callTool(user: { id: string; name: string }, name: string, raw: unknown): Promise<Text> {
  if (!TOOLS.some((t) => t.name === name)) return say(`Unknown tool: ${name}`, true);
  const a = withDefaults(name, raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  try {
    if (name === "list_text_threads") {
      const threads = await loadThreads(await myNumber(user.id));
      const list = threads.filter((t) => !t.archived && (!a.unread_only || t.unread > 0)).slice(0, clampInt(a.limit, 1, 50, 20));
      if (!list.length) return say(a.unread_only ? "No unread texts." : "No text conversations yet.");
      return say(JSON.stringify(list.map((t) => ({ name: t.name, person_id: t.personId, number: t.group ? t.number : formatPhone(t.number), group: t.group || undefined,
        last: t.lastKind === "missed_call" ? "Missed call" : `${t.lastDir === "in" ? "" : "You: "}${t.last.slice(0, 300)}`, at: when(new Date(t.at)), unread: t.unread }))));
    }
    if (name === "read_texts") {
      const ours = await myNumber(user.id);
      const limit = clampInt(a.limit, 1, 100, 30);
      let theirs: string[] = [];
      let who = "";
      if (s("person_id")) {
        const p = await db.person.findFirst({ where: { id: s("person_id"), deletedAt: null }, select: { name: true, phones: { select: { normalized: true } } } });
        if (!p) return say("Unknown contact id: use find_people first.", true);
        const nums = p.phones.map((x) => x.normalized);
        const groups = nums.length ? await db.textThread.findMany({ where: { ourNumber: ours, members: { hasSome: nums } }, select: { sid: true } }) : [];
        theirs = [...nums, ...groups.map((g) => g.sid)];
        who = p.name;
      } else if (s("number")) {
        const n = isGroupKey(s("number")) ? s("number") : normalizePhone(s("number"));
        theirs = [n];
        who = isGroupKey(n) ? "the group" : formatPhone(n);
      } else return say("Give a person_id or a number.", true);
      const rows = theirs.length ? await db.textMessage.findMany({ where: { ourNumber: ours, theirNumber: { in: theirs }, kind: { not: "reaction" } }, orderBy: { createdAt: "desc" }, take: limit,
        include: { sentBy: { select: { name: true } }, person: { select: { name: true } } } }) : [];
      if (!rows.length) return say(`No texts with ${who} on your HQ number.`);
      const lines = rows.reverse().map((m) => {
        const from = m.direction === "out" ? `You${m.sentBy && m.sentBy.name !== user.name ? ` (${m.sentBy.name.split(" ")[0]})` : ""}` : m.person?.name ?? (m.fromNumber ? formatPhone(m.fromNumber) : who);
        const body = m.kind === "missed_call" ? "(missed call)" : m.body || "(photo)";
        const group = isGroupKey(m.theirNumber) ? " [group]" : "";
        const failed = m.status === "failed" || m.status === "undelivered" ? " [not delivered]" : "";
        return `${when(m.createdAt)}${group} ${from}: ${body}${failed}`;
      });
      return say(`Texts with ${who}, oldest first:\n${lines.join("\n")}`);
    }
    if (name === "text_me") {
      const body = s("body").slice(0, 1500);
      if (!body) return say("Nothing to send.", true);
      const ok = await textTeammate(user.id, body);
      if (ok) await logActivity(user.id, "create", "text", null, "Claude texted the owner's cell");
      return say(ok ? "✓ Texted your cell." : "Not sent: texting is off, or there's no HQ number or cell number set (Admin → Integrations).", !ok);
    }
    if (name === "send_text") {
      const prep = await runAssistantTool(user.id, "text_client", a);
      // Only the text this call just prepared is sent, never some other action waiting for a YES by text.
      if (!prep.confirmId || prep.confirmKind !== "text") return say(`Not sent: ${prep.text}`, true);
      const done = await answerConfirm(user, prep.confirmId, true);
      return say(done, !done.startsWith("✓"));
    }
    const r = await runAssistantTool(user.id, name, a);
    return say(r.text);
  } catch (e) {
    if (e instanceof UserError) return say(e.message, true);
    console.error("Claude connector tool failed:", name, e instanceof Error ? e.name : "error");
    return say("Something went wrong in HQ.", true);
  }
}
