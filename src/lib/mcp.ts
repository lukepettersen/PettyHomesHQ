// Claude app connector (owner request 2026-11-17): pure helpers, unit tested in mcp.test.ts.
// HQ is a remote MCP server at /api/mcp; Claude signs in with OAuth (dynamic registration + PKCE), as the owner only.
import { createHash } from "node:crypto";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SCOPE = "hq";
export const ACCESS_MINUTES = 60;
export const REFRESH_DAYS = 60;
export const CODE_MINUTES = 5;

/** Where a sign-in may be sent back to: Claude's own callback, or this computer (for testing tools). */
export function redirectAllowed(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.username || u.password || u.hash) return false;
  if (u.protocol === "https:" && ["claude.ai", "claude.com"].includes(u.hostname) && !u.port) return u.pathname === "/api/mcp/auth_callback";
  return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
}

/** PKCE: the code_verifier hashes (SHA-256, base64url) to the code_challenge sent when signing in. */
export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !challenge) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A sign-in page's "come back here" address: only a path on HQ itself. */
export function safeBack(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  return path;
}

/** The protocol version to answer with: theirs if HQ speaks it, else HQ's newest. */
export const pickVersion = (asked: unknown) => (typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0]);

export type RpcId = string | number | null;
export const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
export const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: "2.0" as const, id, error: { code, message } });

const str = (description: string) => ({ type: "string", description });
type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint?: boolean } };
const read = { readOnlyHint: true };
const write = { readOnlyHint: false, destructiveHint: false };

/** What Claude can do in HQ. Names match the text assistant's where they share its code. */
export const TOOLS: Tool[] = [
  { name: "find_people", title: "Find contacts", description: "Search HQ contacts by name. Up to 8 matches with id, name and stage.", annotations: read,
    inputSchema: { type: "object", properties: { query: str("A name or part of one") }, required: ["query"] } },
  { name: "person_details", title: "Contact details", description: "A contact's phones, emails, address, stage, open deals with key dates, upcoming appointments and open tasks.", annotations: read,
    inputSchema: { type: "object", properties: { person_id: str("Contact id from find_people") }, required: ["person_id"] } },
  { name: "my_schedule", title: "Schedule for a day", description: "HQ appointments on a day (everyone's) and the owner's tasks due that day.", annotations: read,
    inputSchema: { type: "object", properties: { date: str("YYYY-MM-DD") }, required: ["date"] } },
  { name: "list_text_threads", title: "Recent text conversations", description: "The newest text conversations on the owner's HQ business number: who, the last message, when, and how many are unread. Use the person_id or number with read_texts.", annotations: read,
    inputSchema: { type: "object", properties: { unread_only: { type: "boolean", description: "Only conversations with unread texts or missed calls" }, limit: { type: "number", description: "How many (1-50, default 20)" } } } },
  { name: "read_texts", title: "Read a text conversation", description: "The texts in one conversation on the owner's HQ number, oldest first. Give a contact's person_id, or a number or group id from list_text_threads. Reading here doesn't mark them read in HQ.", annotations: read,
    inputSchema: { type: "object", properties: { person_id: str("Contact id, or \"\""), number: str("Phone number or group id from list_text_threads, or \"\""), limit: { type: "number", description: "How many of the newest texts (1-100, default 30)" } } } },
  { name: "send_text", title: "Send a text", description: "Sends a text to a contact from the owner's HQ business number right away (or at a set time), as a group text that includes the owner's own cell when group texts are on. The owner has OK'd sending without asking first: send when they ask, after checking it's the right contact and the times and addresses are right. STOP still blocks it.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: { type: "object", properties: { person_id: str("Contact id from find_people"), body: str("The exact message"), send_date: str("YYYY-MM-DD to send later, or \"\" for now"), send_time: str("HH:MM 24-hour Central time to send later, or \"\"") }, required: ["person_id", "body"] } },
  { name: "text_me", title: "Text the owner", description: "Texts the owner's own cell from their HQ business number (a heads-up, a summary, a reminder). Only ever goes to the owner.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: { type: "object", properties: { body: str("The message") }, required: ["body"] } },
  { name: "add_task", title: "Add a task", description: "Add a task (a to-do or reminder) in HQ, on a contact when person_id is set.", annotations: write,
    inputSchema: { type: "object", properties: {
      title: str("Short, plain"), person_id: str("Contact id, or \"\""), due: str("YYYY-MM-DD"), time: str("HH:MM 24-hour, or \"\""),
      assignee: str("Teammate first name, or \"\" for the owner"), kind: { type: "string", enum: ["followup", "call", "text", "email", "showing", "other"] },
    }, required: ["title", "due"] } },
  { name: "add_note", title: "Add a note", description: "Log a note, call or text on a contact's timeline in HQ.", annotations: write,
    inputSchema: { type: "object", properties: { person_id: str("Contact id"), kind: { type: "string", enum: ["note", "call", "text"] }, body: str("The note") }, required: ["person_id", "body"] } },
  { name: "add_contact", title: "Add a contact", description: "Add a new contact to HQ. Returns the existing contact instead if that number or email is already in HQ.", annotations: write,
    inputSchema: { type: "object", properties: { name: str("Full name, or a couple: \"Jack & Adonis Smith\""), phone: str("Phone number, or \"\""), email: str("Email, or \"\"") }, required: ["name"] } },
];

/** Fills in the text assistant's required fields that the connector lets Claude leave out. */
export function withDefaults(name: string, a: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, Record<string, unknown>> = {
    add_task: { person_id: "", time: "", assignee: "", kind: "followup" },
    add_note: { kind: "note" },
    add_contact: { phone: "", email: "", more_phones: [], more_emails: [], partner_type: "" },
    send_text: { send_date: "", send_time: "" },
  };
  return { ...(d[name] ?? {}), ...a };
}

/** A number between lo and hi (default when missing or not a number). */
export const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
