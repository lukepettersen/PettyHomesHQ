import "server-only";
import { db } from "@/server/db";

// Group texting troubleshooting (owner 2026-10-22): the last few incoming texts and which way Twilio sent them
// (plain webhook or Conversations). Only the last 4 digits of numbers and the field names are kept, never bodies.

const KEY = "texting.debug";
export type InboundNote = { at: string; via: "plain" | "conversation"; from: string; to: string; group?: boolean; people?: number; fields?: string[]; media?: number };
const last4 = (n: string | undefined) => (n ?? "").replace(/\D/g, "").slice(-4);

export async function noteInbound(n: Omit<InboundNote, "at" | "from" | "to"> & { from?: string; to?: string }) {
  try {
    const row = await db.appSetting.findUnique({ where: { key: KEY } });
    const list = (Array.isArray(row?.value) ? (row.value as InboundNote[]) : []).slice(0, 14);
    const entry: InboundNote = { ...n, at: new Date().toISOString(), from: last4(n.from), to: last4(n.to) };
    const value = [entry, ...list];
    await db.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  } catch { /* troubleshooting only */ }
}

export async function recentInbound(): Promise<InboundNote[]> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return Array.isArray(row?.value) ? (row.value as InboundNote[]) : [];
}
