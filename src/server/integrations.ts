import "server-only";
import { db } from "@/server/db";

// Admin → Integrations (SPEC.md §11–13). Keys live only in Railway variables; this reads
// whether they are set and never returns their values.

export type Integration = {
  id: "google" | "texting" | "fub" | "storage";
  name: string;
  what: string;
  vars: { name: string; help: string }[];
  connected: boolean;
  missing: string[];
  note?: string;
  detail?: string; // safe-to-show info, e.g. the texting number
};

const set = (name: string) => !!process.env[name]?.trim();

const DEFS: Omit<Integration, "connected" | "missing" | "detail">[] = [
  {
    id: "google", name: "Google Workspace",
    what: "Sign-in for pettyhomes.com accounts, and Google Calendar: appointments and contract dates go on the calendar with invites. Gmail (emails on timelines, drafts, mention emails) comes later.",
    vars: [
      { name: "GOOGLE_CLIENT_ID", help: "Google Cloud → APIs & Services → Credentials → the HQ OAuth client" },
      { name: "GOOGLE_CLIENT_SECRET", help: "Same screen as the client ID" },
    ],
    note: "For Calendar: in Google Cloud, enable the Google Calendar API and add the redirect address …/api/google/callback to the HQ OAuth client. Then click Connect Google Calendar.",
  },
  {
    id: "texting", name: "Business texting (Twilio)",
    what: "Two-way texts and missed calls in Messages from a business number. Off until all three keys are set.",
    vars: [
      { name: "TWILIO_ACCOUNT_SID", help: "Twilio Console → Account info" },
      { name: "TWILIO_AUTH_TOKEN", help: "Twilio Console → Account info" },
      { name: "TWILIO_PHONE_NUMBER", help: "The business number you bought, like +16125550100" },
    ],
    note: "Before texting customers, finish Twilio's business-texting registration (A2P 10DLC).",
  },
  {
    id: "fub", name: "Follow Up Boss",
    what: "Only needed to copy notes and text/email history. People come over from a FUB spreadsheet export, which needs no key.",
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
    note: "Set up together with the Files card; exact steps will be in docs/ops.md.",
  },
];

export function integrationStatus(): Integration[] {
  return DEFS.map((d) => {
    const missing = d.vars.filter((v) => !set(v.name)).map((v) => v.name);
    const phone = process.env.TWILIO_PHONE_NUMBER?.trim();
    return { ...d, missing, connected: missing.length === 0, detail: d.id === "texting" && phone && missing.length === 0 ? phone : undefined };
  });
}

export const isConnected = (id: Integration["id"]) => integrationStatus().find((i) => i.id === id)!.connected;

/** Texting sends only when Twilio is connected AND the Admin switch is on. */
export async function textingEnabled(): Promise<boolean> {
  if (!isConnected("texting")) return false;
  const row = await db.appSetting.findUnique({ where: { key: "texting.enabled" } });
  return row?.value === true;
}
