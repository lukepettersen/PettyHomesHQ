// Each person's sound volumes (owner request 2026-11-10: "Alyssa wants to be able to customize how loud it is").
// 100 is how HQ sounded before; 0 is silent, 200 twice as loud. Saved per person (AppSetting "sounds.<userId>"). Pure, tested.

export type SoundKind = "alarms" | "alerts" | "calls";
export type SoundPrefs = Record<SoundKind, number>;
export const SOUND_KINDS: { key: SoundKind; label: string; hint: string }[] = [
  { key: "alerts", label: "Alerts", hint: "New texts, offers, paperwork and other pop-ups (with the bell)" },
  { key: "alarms", label: "Task alarms", hint: "A timed task coming due (repeats until you handle it)" },
  { key: "calls", label: "Incoming calls", hint: "A call to your HQ number while HQ is open" },
];
export const SOUND_DEFAULTS: SoundPrefs = { alerts: 100, alarms: 100, calls: 100 };
export const SOUND_MAX = 200;

export function cleanSoundPrefs(v: unknown): SoundPrefs {
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...SOUND_DEFAULTS };
  for (const { key } of SOUND_KINDS) {
    const n = Number(src[key]);
    if (Number.isFinite(n)) out[key] = Math.max(0, Math.min(SOUND_MAX, Math.round(n / 5) * 5));
  }
  return out;
}

/** A sound's peak loudness: its usual peak scaled by the person's setting, kept below clipping. */
export const peakGain = (usual: number, pct: number) => Math.min(0.95, usual * Math.max(0, pct) / 100);

export const soundKey = (userId: string) => `sounds.${userId}`;
