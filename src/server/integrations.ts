import "server-only";
import { db } from "@/server/db";

// Admin → Integrations (SPEC.md §11–13). Keys live only in Railway variables; this reads
// whether they are set and never returns their values.

export type Integration = {
  id: "google" | "texting" | "fub" | "storage" | "claude";
  name: string;
  what: string;
  vars: { name: string; help: string }[];
  connected: boolean;
  missing: string[];
  note?: string;
};

const set = (name: string) => !!process.env[name]?.trim();

const DEFS: Omit<Integration, "connected" | "missing">[] = [
  {
    id: "google", name: "Google Workspace",
    what: "Sign-in for pettyhomes.com accounts, Google Calendar (appointments and contract dates with invites) and sending email from HQ through Gmail.",
    vars: [
      { name: "GOOGLE_CLIENT_ID", help: "Google Cloud → APIs & Services → Credentials → the HQ OAuth client" },
      { name: "GOOGLE_CLIENT_SECRET", help: "Same screen as the client ID" },
    ],
    note: "In Google Cloud, enable the Google Calendar API and the Gmail API, and add the redirect address …/api/google/callback to the HQ OAuth client. Then click Connect Google (or Reconnect Google to turn on email).",
  },
  {
    id: "texting", name: "Business texting (Twilio)",
    what: "Two-way texts and missed calls in Messages, from each team member's own business number (set below). Off until both keys are set.",
    vars: [
      { name: "TWILIO_ACCOUNT_SID", help: "Twilio Console → Account info" },
      { name: "TWILIO_AUTH_TOKEN", help: "Twilio Console → Account info" },
    ],
    note: "Texts only go through once Twilio's business-texting registration (A2P 10DLC) is approved and each number is in the registered Messaging Service.",
  },
  {
    id: "fub", name: "Follow Up Boss",
    what: "Copies your contacts from Follow Up Boss (Admin → Import from Follow Up Boss). Read only.",
    vars: [{ name: "FUB_API_KEY", help: "Follow Up Boss → Admin → API → create a key" }],
    note: "The import is a one-time copy with a practice run first. Nothing in Follow Up Boss is changed.",
  },
  {
    id: "storage", name: "File storage",
    what: "A private storage bucket for the Files card on contacts (contracts, disclosures, photos). Download links expire.",
    vars: [
      { name: "S3_ENDPOINT", help: "The storage provider's endpoint URL" },
      { name: "S3_REGION", help: "For example us-east-1 or auto" },
      { name: "S3_BUCKET", help: "The bucket name" },
      { name: "S3_ACCESS_KEY_ID", help: "An access key limited to that bucket" },
      { name: "S3_SECRET_ACCESS_KEY", help: "The secret for that access key" },
    ],
    note: "Recommended: Cloudflare R2 (create a private bucket and an API token for it, then add the five variables). Step-by-step in docs/ops.md.",
  },
  {
    id: "claude", name: "Ask Claude",
    what: "The Ask Claude button: say or type what to add (tasks, notes, logged calls or texts, @mentions) and review it before it saves. What you say, plus the matching contact names, is sent to Anthropic to read; Anthropic doesn't train on it.",
    vars: [{ name: "ANTHROPIC_API_KEY", help: "console.anthropic.com → Settings → API keys → Create key" }],
    note: "Add a little prepaid credit at console.anthropic.com → Billing (each request costs about a cent or two).",
  },
];

export function integrationStatus(): Integration[] {
  return DEFS.map((d) => {
    const missing = d.vars.filter((v) => !set(v.name)).map((v) => v.name);
    return { ...d, missing, connected: missing.length === 0 };
  });
}

export const isConnected = (id: Integration["id"]) => integrationStatus().find((i) => i.id === id)!.connected;

/** Texting sends only when Twilio is connected AND the Admin switch is on. */
export async function textingEnabled(): Promise<boolean> {
  if (!isConnected("texting")) return false;
  const row = await db.appSetting.findUnique({ where: { key: "texting.enabled" } });
  return row?.value === true;
}
