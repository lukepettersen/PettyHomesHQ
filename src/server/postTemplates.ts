import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { cleanTemplates, type PostTemplate } from "@/lib/postTemplates";

// Instagram post templates (owner request 2026-11-26), kept in AppSetting `posts.templates`.
const KEY = "posts.templates";
export async function loadPostTemplates(): Promise<PostTemplate[]> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return cleanTemplates(row?.value ?? null);
}
export async function savePostTemplates(userId: string, input: unknown): Promise<PostTemplate[]> {
  const value = cleanTemplates(input);
  await db.appSetting.upsert({ where: { key: KEY }, update: { value: value as object[] }, create: { key: KEY, value: value as object[] } });
  await logActivity(userId, "update", "setting", null, `Saved Instagram post templates (${value.length})`);
  return value;
}
