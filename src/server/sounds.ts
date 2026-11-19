import "server-only";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { cleanSoundPrefs, soundKey, type SoundPrefs } from "@/lib/sounds";
import { ALERT_KINDS, alertKey, cleanAlertPrefs, type AlertKind, type AlertPrefs } from "@/lib/alerts";

// Each person's sound volumes (owner request 2026-11-10), in AppSetting "sounds.<userId>".
export async function loadSoundPrefs(userId: string): Promise<SoundPrefs> {
  return cleanSoundPrefs((await db.appSetting.findUnique({ where: { key: soundKey(userId) } }))?.value);
}

export async function saveSoundPrefs(userId: string, input: unknown, by = userId): Promise<SoundPrefs> {
  const value = cleanSoundPrefs(input);
  await db.appSetting.upsert({ where: { key: soundKey(userId) }, update: { value }, create: { key: soundKey(userId), value } });
  await logActivity(by, "update", "setting", soundKey(userId), `Changed ${by === userId ? "" : "a teammate's "}sound volumes: alerts ${value.alerts}%, task alarms ${value.alarms}%, calls ${value.calls}%`);
  return value;
}

// Which bell alerts pop up with a chime for each person (owner request 2026-11-19), in AppSetting "alerts.<userId>".
export async function loadAlertPrefs(userId: string): Promise<AlertPrefs> {
  return cleanAlertPrefs((await db.appSetting.findUnique({ where: { key: alertKey(userId) } }))?.value);
}

export async function saveAlertPrefs(userId: string, input: unknown, by = userId): Promise<AlertPrefs> {
  const value = cleanAlertPrefs(input);
  await db.appSetting.upsert({ where: { key: alertKey(userId) }, update: { value }, create: { key: alertKey(userId), value } });
  const off = ALERT_KINDS.filter((k) => !value[k.key]).map((k) => k.label.toLowerCase());
  await logActivity(by, "update", "setting", alertKey(userId), `Changed ${by === userId ? "" : "a teammate's "}pop-up alerts${off.length ? `: off for ${off.join(", ")}` : ": all on"}`);
  return value;
}

/** A bell alert for the kinds people opt into (new showings, client emails, mass sends finished): only for those of
 *  `userIds` who turned that kind on in My settings, so nobody else's bell fills up. Never throws. */
export async function alertIfWanted(kind: AlertKind, userIds: string[], data: { text: string; personId?: string | null; link?: string | null }): Promise<void> {
  try {
    for (const toId of [...new Set(userIds)]) {
      if (!(await loadAlertPrefs(toId))[kind]) continue;
      await db.notification.create({ data: { toId, alert: true, text: data.text.slice(0, 300), personId: data.personId ?? null, link: data.link ?? null } });
    }
  } catch (e) { console.error("Alert:", kind, e instanceof Error ? e.name : "error"); }
}
