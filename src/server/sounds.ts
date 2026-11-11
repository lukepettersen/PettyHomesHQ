import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { cleanSoundPrefs, soundKey, type SoundPrefs } from "@/lib/sounds";

// Each person's sound volumes (owner request 2026-11-10), in AppSetting "sounds.<userId>".
export async function loadSoundPrefs(userId: string): Promise<SoundPrefs> {
  return cleanSoundPrefs((await db.appSetting.findUnique({ where: { key: soundKey(userId) } }))?.value);
}

export async function saveSoundPrefs(userId: string, input: unknown): Promise<SoundPrefs> {
  const value = cleanSoundPrefs(input);
  await db.appSetting.upsert({ where: { key: soundKey(userId) }, update: { value }, create: { key: soundKey(userId), value } });
  await logActivity(userId, "update", "setting", soundKey(userId), `Changed sound volumes: alerts ${value.alerts}%, task alarms ${value.alarms}%, calls ${value.calls}%`);
  return value;
}
